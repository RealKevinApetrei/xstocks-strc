import { ethers } from 'ethers';
import { getProvider } from '../../../lib/provider';
import { query } from '../../../db/pool';
import { config } from '../../../config';
import { approvalExecutor } from './approval.executor';
import { borrowExecutor } from './borrow.executor';
import { smartAccountService, type Call } from '../smart-account.service';
import { cowSwapService } from '../../cowswap/cowswap.service';
import { signerService } from '../signer.service';
import { MAX_LEVERAGE, STRC_DUST, LEVERAGE_TARGET_HF } from '@xstocks/shared';
import wSTRCABI from '@xstocks/shared/abis/wSTRC.json';
import { pythPriceService } from '../../pyth/pyth-price.service';

export class LoopExecutor {
  private wstrcIface = new ethers.Interface(wSTRCABI);

  /** Track active loops in memory for state awareness */
  private activeLoops = new Map<string, { privyId: string; targetLeverage: number }>();
  /** Loops marked for cancellation — checked between iterations */
  private cancelledLoops = new Set<string>();

  isActive(loopId: string): boolean {
    return this.activeLoops.has(loopId);
  }

  /** Request cancellation of an active loop. Takes effect between iterations. */
  requestCancel(loopId: string): boolean {
    if (!this.activeLoops.has(loopId)) return false;
    this.cancelledLoops.add(loopId);
    console.log(`[LOOP ${loopId}] Cancellation requested — will stop after current step`);
    return true;
  }

  /**
   * Resume any IN_PROGRESS loops after server restart.
   * Note: loops mid-iteration cannot be safely resumed (CoW orders may be stale).
   * We mark them as COMPLETED_PARTIAL so users can start a new loop.
   */
  async resumeActiveLoops(): Promise<void> {
    const { rows } = await query(
      `SELECT id, privy_id, target_leverage, current_iteration FROM loop_executions WHERE status = 'IN_PROGRESS'`,
    );
    for (const row of rows) {
      console.log(`[LOOP ${row.id}] Was IN_PROGRESS at restart — marking COMPLETED_PARTIAL (iteration ${row.current_iteration})`);
      await query(
        `UPDATE loop_executions SET status = 'COMPLETED_PARTIAL', error = 'Server restarted during execution — position is safe but loop stopped' WHERE id = $1`,
        [row.id],
      );
    }
    if (rows.length > 0) console.log(`Recovered ${rows.length} interrupted loop(s)`);
  }

  /**
   * Start a leveraged loop.
   * Entry: USDC → CoW swap to STRC → wrap → supply → borrow → repeat.
   */
  async startLoop(params: {
    privyId: string;
    strcAmount: bigint; // USDC amount from frontend
    targetLeverage: number;
    maxSlippageBps: number;
  }): Promise<string> {
    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(params.privyId);

    const { rows: [execReq] } = await query(
      `INSERT INTO execution_requests (privy_id, type, status, smart_account_address)
       VALUES ($1, 'LOOP', 'PENDING', $2) RETURNING id`,
      [params.privyId, smartAccountAddr],
    );

    const { rows: [loop] } = await query(
      `INSERT INTO loop_executions
       (execution_request_id, privy_id, strc_amount, target_leverage, max_slippage_bps, status)
       VALUES ($1, $2, $3, $4, $5, 'PENDING') RETURNING id`,
      [execReq.id, params.privyId, params.strcAmount.toString(), params.targetLeverage, 0],
    );

    // Track in memory + run in background
    this.activeLoops.set(loop.id, { privyId: params.privyId, targetLeverage: params.targetLeverage });

    this.runLoop(loop.id, params.privyId, params.strcAmount, params.targetLeverage)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[LOOP ${loop.id}] Fatal error:`, msg);
        query(`UPDATE loop_executions SET status = 'FAILED', error = $2 WHERE id = $1`, [loop.id, msg.slice(0, 500)])
          .catch((dbErr) => console.error(`[LOOP ${loop.id}] DB update also failed:`, dbErr));
      })
      .finally(() => { this.activeLoops.delete(loop.id); this.cancelledLoops.delete(loop.id); });

    return loop.id;
  }

  private async runLoop(
    loopId: string,
    privyId: string,
    usdcAmount: bigint,
    targetLeverage: number,
  ): Promise<void> {
    await query(`UPDATE loop_executions SET status = 'IN_PROGRESS' WHERE id = $1`, [loopId]);

    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(privyId);

    // Push fresh Pyth price on-chain before any execution
    await this.updateStage(loopId, 'Refreshing oracle price...');
    await pythPriceService.ensureFreshPrice();

    // Step 0: Initial swap USDC → STRC via CoW
    let currentStrcAmount: bigint;
    try {
      await this.updateStage(loopId, 'Swapping USDC → STRC via CoW Protocol...');
      currentStrcAmount = await this.initialSwap(loopId, privyId, smartAccountAddr, usdcAmount);
      if (currentStrcAmount <= STRC_DUST) {
        await this.failLoop(loopId, 'Initial swap returned dust amount — insufficient STRC received');
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown';
      let userMsg = `Initial USDC→STRC swap failed: ${msg}`;
      if (msg.includes('insufficient funds for gas')) {
        userMsg = 'Transaction failed: wallet has no ETH for gas. Gas sponsorship may not be active — contact support.';
      } else if (msg.includes('insufficient balance') || msg.includes('transfer amount exceeds')) {
        userMsg = 'Insufficient USDC balance in wallet. Deposit more USDC before starting a loop.';
      }
      await this.failLoop(loopId, userMsg);
      return;
    }

    // Loop: wrap+supply STRC → check leverage → borrow+swap → repeat
    for (let iteration = 1; iteration <= config.maxLoopIterations; iteration++) {
      // ── Check for cancellation ──
      if (this.cancelledLoops.has(loopId)) {
        this.cancelledLoops.delete(loopId);
        const posAfter = await borrowExecutor.getPosition(smartAccountAddr);
        await query(
          `UPDATE loop_executions SET status = 'COMPLETED_PARTIAL', current_iteration = $2, health_factor = $3,
           effective_leverage = $4, error = 'Cancelled by user' WHERE id = $1`,
          [loopId, iteration - 1, posAfter.healthFactor, borrowExecutor.calculateLeverage(posAfter.healthFactor)],
        );
        console.log(`[LOOP ${loopId}] Cancelled by user at iteration ${iteration}`);
        return;
      }

      // ── Phase 1: Wrap + Supply STRC into Morpho ──
      await this.updateStage(loopId, `Iteration ${iteration}: wrapping and supplying STRC...`);
      let supplySuccess = await this.wrapAndSupply(loopId, privyId, smartAccountAddr, iteration, currentStrcAmount);
      if (!supplySuccess) {
        console.log(`[LOOP ${loopId}] Wrap+supply failed, retrying after 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        supplySuccess = await this.wrapAndSupply(loopId, privyId, smartAccountAddr, iteration, currentStrcAmount);
      }
      if (!supplySuccess) {
        const posAfter = await borrowExecutor.getPosition(smartAccountAddr);
        await query(
          `UPDATE loop_executions SET status = 'COMPLETED_PARTIAL', current_iteration = $2, health_factor = $3,
           effective_leverage = $4, error = 'Wrap+supply failed' WHERE id = $1`,
          [loopId, iteration, posAfter.healthFactor, borrowExecutor.calculateLeverage(posAfter.healthFactor)],
        );
        return;
      }

      // ── Phase 2: Check leverage after supply ──
      const posAfterSupply = await borrowExecutor.getPosition(smartAccountAddr);
      const currentLeverage = borrowExecutor.calculateLeverage(posAfterSupply.healthFactor);
      console.log(`[LOOP ${loopId}] After supply ${iteration}: leverage=${currentLeverage.toFixed(2)}x, target=${targetLeverage}x, HF=${posAfterSupply.healthFactor.toFixed(2)}`);

      if (currentLeverage >= targetLeverage) {
        await query(
          `UPDATE loop_executions SET status = 'COMPLETED', current_iteration = $2, health_factor = $3,
           effective_leverage = $4 WHERE id = $1`,
          [loopId, iteration, posAfterSupply.healthFactor, currentLeverage],
        );
        console.log(`[LOOP ${loopId}] Target ${targetLeverage}x reached at ${currentLeverage.toFixed(2)}x`);
        return;
      }

      // Emergency stop
      if (posAfterSupply.borrowed > 0n && posAfterSupply.healthFactor < config.emergencyHF) {
        await query(
          `UPDATE loop_executions SET status = 'COMPLETED_PARTIAL', current_iteration = $2, health_factor = $3,
           effective_leverage = $4, error = 'Emergency stop: HF below ${config.emergencyHF}' WHERE id = $1`,
          [loopId, iteration, posAfterSupply.healthFactor, currentLeverage],
        );
        return;
      }

      // ── Phase 3: Borrow + Swap USDC → STRC (with retry) ──
      await this.updateStage(loopId, `Iteration ${iteration}: borrowing and swapping...`);
      let borrowResult = await this.borrowAndSwap(loopId, privyId, smartAccountAddr, iteration, usdcAmount, targetLeverage);

      if (!borrowResult.success) {
        console.log(`[LOOP ${loopId}] Borrow+swap failed, retrying after 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        borrowResult = await this.borrowAndSwap(loopId, privyId, smartAccountAddr, iteration, usdcAmount, targetLeverage);
      }

      if (!borrowResult.success || borrowResult.strcReceived <= STRC_DUST) {
        const posAfter = await borrowExecutor.getPosition(smartAccountAddr);
        await query(
          `UPDATE loop_executions SET status = 'COMPLETED_PARTIAL', current_iteration = $2, health_factor = $3,
           effective_leverage = $4, error = ${!borrowResult.success ? "'Borrow+swap failed after retry'" : "'Swap returned dust'"} WHERE id = $1`,
          [loopId, iteration, posAfter.healthFactor, borrowExecutor.calculateLeverage(posAfter.healthFactor)],
        );
        return;
      }

      currentStrcAmount = borrowResult.strcReceived;
      await query(`UPDATE loop_executions SET current_iteration = $2 WHERE id = $1`, [loopId, iteration]);
    }

    // Max iterations reached
    const finalPos = await borrowExecutor.getPosition(smartAccountAddr);
    const finalLev = borrowExecutor.calculateLeverage(finalPos.healthFactor);
    await query(
      `UPDATE loop_executions SET status = $2, current_iteration = $3, health_factor = $4, effective_leverage = $5,
       error = $6 WHERE id = $1`,
      [loopId,
       finalLev >= targetLeverage ? 'COMPLETED' : 'COMPLETED_PARTIAL',
       config.maxLoopIterations,
       finalPos.healthFactor,
       finalLev,
       finalLev >= targetLeverage ? null : `Max ${config.maxLoopIterations} iterations reached`,
      ],
    );
  }

  /**
   * Initial USDC → STRC swap via CoW before entering the loop.
   */
  private async initialSwap(loopId: string, privyId: string, smartAccountAddr: string, usdcAmount: bigint): Promise<bigint> {
    // Step 1: Approve USDC for CoW VaultRelayer (from smart wallet)
    await this.updateStage(loopId, 'Approving USDC for CoW Protocol...');
    const approveCalls = approvalExecutor.buildApproveCalls({
      token: config.usdc, spender: config.cowVaultRelayer, amount: usdcAmount,
    });
    const approveHash = await smartAccountService.sendBatchUserOp(privyId, approveCalls);
    await this.updateStage(loopId, 'Waiting for approval confirmation...');
    await smartAccountService.waitForReceipt(approveHash);

    // Verify approval on-chain
    await this.updateStage(loopId, 'Verifying approval on-chain...');
    const provider = getProvider();
    const usdc = new ethers.Contract(config.usdc, [
      'function allowance(address,address) view returns (uint256)',
      'function balanceOf(address) view returns (uint256)',
    ], provider);

    for (let i = 0; i < 15; i++) {
      const balance: bigint = await usdc.balanceOf(smartAccountAddr);
      const allowance: bigint = await usdc.allowance(smartAccountAddr, config.cowVaultRelayer);
      console.log(`[LOOP ${loopId}] Check ${i + 1}: balance=${balance}, allowance=${allowance} (need ${usdcAmount})`);
      if (balance >= usdcAmount && allowance >= usdcAmount) break;
      if (i === 14) throw new Error(`Not ready after 45s: balance=${Number(balance) / 1e6}, allowance=${Number(allowance) / 1e6}`);
      await new Promise(r => setTimeout(r, 3000));
    }

    // Step 2: Get CoW quote (from = smart wallet)
    await this.updateStage(loopId, 'Getting CoW swap quote...');
    const quote = await cowSwapService.getQuote({
      sellToken: config.usdc, buyToken: config.strc, sellAmount: usdcAmount, from: smartAccountAddr,
    });

    // Step 3: Submit order with presign scheme (no eip712 signature needed)
    await this.updateStage(loopId, 'Submitting CoW order...');
    const orderUid = await cowSwapService.createOrder(quote, '');

    // Step 4: Pre-sign the order on-chain from the smart wallet
    await this.updateStage(loopId, 'Pre-signing order on-chain...');
    const preSignCall = cowSwapService.buildPreSignatureCall(orderUid);
    const preSignHash = await smartAccountService.sendBatchUserOp(privyId, [preSignCall]);
    await smartAccountService.waitForReceipt(preSignHash);

    // Step 5: Wait for presign to be picked up by CoW, then wait for fill
    await this.updateStage(loopId, 'Waiting for presign confirmation...');
    for (let i = 0; i < 20; i++) {
      try {
        const status = await cowSwapService.pollOrderStatus(orderUid);
        console.log(`[LOOP ${loopId}] CoW order status: ${status}`);
        if (status !== 'presignaturePending') break;
      } catch {}
      await new Promise(r => setTimeout(r, 3000));
    }

    await this.updateStage(loopId, 'Waiting for CoW swap to fill...');
    const fill = await cowSwapService.waitForFill(orderUid);

    if (fill.buyAmount <= 0n) {
      throw new Error('CoW swap returned 0 STRC');
    }

    return fill.buyAmount;
  }

  /**
   * Execute one loop iteration: wrap → supply → borrow → swap.
   */
  private async executeIteration(
    loopId: string,
    privyId: string,
    smartAccountAddr: string,
    iterationNumber: number,
    strcAmount: bigint,
    targetLeverage: number = 3.5,
  ): Promise<{ success: boolean; strcReceived: bigint }> {
    const { rows: [iter] } = await query(
      `INSERT INTO loop_iterations (loop_execution_id, iteration_number, step, strc_deposited, started_at)
       VALUES ($1, $2, 'PENDING', $3, NOW()) RETURNING id`,
      [loopId, iterationNumber, strcAmount.toString()],
    );

    try {
      const provider = getProvider();

      // Verify STRC is actually in the wallet before trying to wrap
      const strcContract = new ethers.Contract(config.strc, ['function balanceOf(address) view returns (uint256)'], provider);
      const actualStrcBalance: bigint = await strcContract.balanceOf(smartAccountAddr);
      console.log(`[LOOP ${loopId}] Iteration ${iterationNumber}: STRC balance=${actualStrcBalance}, expected=${strcAmount}`);
      if (actualStrcBalance < strcAmount) {
        throw new Error(`STRC balance ${Number(actualStrcBalance) / 1e18} < expected ${Number(strcAmount) / 1e18}. CoW swap may not have filled.`);
      }

      const wstrcContract = new ethers.Contract(config.wstrc, wSTRCABI, provider);

      // Calculate expected wSTRC from wrapping
      const wstrcAmount: bigint = await wstrcContract.strcToWstrc(strcAmount);
      if (wstrcAmount <= 0n) {
        throw new Error('wSTRC amount rounds to zero');
      }

      // Calculate safe borrow amount, capped by target leverage
      const currentPosition = await borrowExecutor.getPosition(smartAccountAddr);
      const iterTargetHF = LEVERAGE_TARGET_HF[targetLeverage] ?? config.loopTargetHF;
      let maxBorrowUsdc = await borrowExecutor.calculateSafeBorrowAmount(
        wstrcAmount, currentPosition, iterTargetHF,
      );

      // Log borrow amount
      console.log(`[LOOP] Borrowing ${Number(maxBorrowUsdc) / 1e6} USDC (target ${targetLeverage}x)`);

      if (maxBorrowUsdc === 0n) {
        await query(`UPDATE loop_iterations SET step = 'COMPLETED', error = 'No safe borrow available', completed_at = NOW() WHERE id = $1`, [iter.id]);
        return { success: false, strcReceived: 0n };
      }

      // Batch UserOp: approve STRC → wrap → approve wSTRC → supply → borrow
      await query(`UPDATE loop_iterations SET step = 'WRAPPING' WHERE id = $1`, [iter.id]);

      const calls: Call[] = [
        ...approvalExecutor.buildApproveCalls({ token: config.strc, spender: config.wstrc, amount: strcAmount }),
        { to: config.wstrc, data: this.wstrcIface.encodeFunctionData('wrap', [strcAmount]) },
        ...approvalExecutor.buildApproveCalls({ token: config.wstrc, spender: config.morpho, amount: wstrcAmount }),
        ...borrowExecutor.buildSupplyCollateralCalls(wstrcAmount, smartAccountAddr),
        ...borrowExecutor.buildBorrowCalls(maxBorrowUsdc, smartAccountAddr, smartAccountAddr),
      ];

      await query(`UPDATE loop_iterations SET step = 'SUPPLYING' WHERE id = $1`, [iter.id]);
      const userOpHash = await smartAccountService.sendBatchUserOp(privyId, calls);
      await query(`UPDATE loop_iterations SET user_op_hash = $2, step = 'BORROWING' WHERE id = $1`, [iter.id, userOpHash]);

      const receipt = await smartAccountService.waitForReceipt(userOpHash);
      if (!receipt.success) {
        await query(`UPDATE loop_iterations SET step = 'FAILED', error = 'UserOp reverted' WHERE id = $1`, [iter.id]);
        return { success: false, strcReceived: 0n };
      }

      // CoW swap: approve USDC → create order → wait for fill
      await query(`UPDATE loop_iterations SET step = 'SWAPPING', usdc_borrowed = $2, wstrc_minted = $3 WHERE id = $1`,
        [iter.id, maxBorrowUsdc.toString(), wstrcAmount.toString()]);

      const cowApproveCalls = approvalExecutor.buildApproveCalls({
        token: config.usdc, spender: config.cowVaultRelayer, amount: maxBorrowUsdc,
      });
      const cowApproveHash = await smartAccountService.sendBatchUserOp(privyId, cowApproveCalls);
      await smartAccountService.waitForReceipt(cowApproveHash);

      const quote = await cowSwapService.getQuote({
        sellToken: config.usdc, buyToken: config.strc, sellAmount: maxBorrowUsdc, from: smartAccountAddr,
      });

      // Use presign for smart wallet CoW orders
      const orderUid = await cowSwapService.createOrder(quote, '');
      await query(`UPDATE loop_iterations SET cow_order_uid = $2 WHERE id = $1`, [iter.id, orderUid]);

      // Pre-sign on-chain
      const preSignCall = cowSwapService.buildPreSignatureCall(orderUid);
      const preSignHash = await smartAccountService.sendBatchUserOp(privyId, [preSignCall]);
      await smartAccountService.waitForReceipt(preSignHash);

      // Wait for presign to be picked up
      for (let i = 0; i < 20; i++) {
        const status = await cowSwapService.pollOrderStatus(orderUid);
        if (status !== 'presignaturePending') break;
        await new Promise(r => setTimeout(r, 3000));
      }

      const fill = await cowSwapService.waitForFill(orderUid);

      // Update position state after iteration
      const positionAfter = await borrowExecutor.getPosition(smartAccountAddr);
      const leverageAfter = borrowExecutor.calculateLeverage(positionAfter.healthFactor);

      await query(
        `UPDATE loop_iterations SET step = 'COMPLETED', strc_received = $2,
         health_factor_after = $3, effective_leverage_after = $4, completed_at = NOW() WHERE id = $1`,
        [iter.id, fill.buyAmount.toString(), positionAfter.healthFactor, leverageAfter],
      );

      return { success: true, strcReceived: fill.buyAmount };

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[LOOP ${loopId}] Iteration ${iterationNumber} error:`, message);
      await query(`UPDATE loop_iterations SET step = 'FAILED', error = $2 WHERE id = $1`, [iter.id, message.slice(0, 500)]);
      return { success: false, strcReceived: 0n };
    }
  }

  /** Phase 1: Wrap STRC → wSTRC and supply to Morpho */
  private async wrapAndSupply(loopId: string, privyId: string, smartAccountAddr: string, iteration: number, strcAmount: bigint): Promise<boolean> {
    try {
      const provider = getProvider();
      const strcContract = new ethers.Contract(config.strc, ['function balanceOf(address) view returns (uint256)'], provider);
      const actualStrcBalance: bigint = await strcContract.balanceOf(smartAccountAddr);
      console.log(`[LOOP ${loopId}] Wrap+supply ${iteration}: STRC balance=${Number(actualStrcBalance) / 1e18}, using=${Number(strcAmount) / 1e18}`);

      if (actualStrcBalance < strcAmount) {
        // Use actual balance if it's close enough (rounding from CoW)
        if (actualStrcBalance > strcAmount * 99n / 100n) {
          strcAmount = actualStrcBalance;
        } else {
          console.error(`[LOOP ${loopId}] STRC balance too low: ${Number(actualStrcBalance) / 1e18} < ${Number(strcAmount) / 1e18}`);
          return false;
        }
      }

      const wstrcContract = new ethers.Contract(config.wstrc, wSTRCABI, provider);
      const wstrcAmount: bigint = await wstrcContract.strcToWstrc(strcAmount);
      if (wstrcAmount <= 0n) return false;

      // Approve STRC → wrap → approve wSTRC → supply (4 sequential calls)
      const calls: Call[] = [
        ...approvalExecutor.buildApproveCalls({ token: config.strc, spender: config.wstrc, amount: strcAmount }),
        { to: config.wstrc, data: this.wstrcIface.encodeFunctionData('wrap', [strcAmount]) },
        ...approvalExecutor.buildApproveCalls({ token: config.wstrc, spender: config.morpho, amount: wstrcAmount }),
        ...borrowExecutor.buildSupplyCollateralCalls(wstrcAmount, smartAccountAddr),
      ];

      const hash = await smartAccountService.sendBatchUserOp(privyId, calls);
      await smartAccountService.waitForReceipt(hash);
      console.log(`[LOOP ${loopId}] Wrap+supply ${iteration}: supplied ${Number(wstrcAmount) / 1e18} wSTRC`);
      return true;
    } catch (err) {
      console.error(`[LOOP ${loopId}] Wrap+supply ${iteration} error:`, err instanceof Error ? err.message : err);
      return false;
    }
  }

  /** Phase 2: Borrow USDC and swap to STRC via CoW */
  private async borrowAndSwap(loopId: string, privyId: string, smartAccountAddr: string, iteration: number, originalDepositUsdc: bigint, targetLeverage: number): Promise<{ success: boolean; strcReceived: bigint }> {
    try {
      const currentPosition = await borrowExecutor.getPosition(smartAccountAddr);
      // Use per-leverage targetHF (e.g. 1.1 for 3.5x vs 1.2 for 2x/3x)
      const targetHF = LEVERAGE_TARGET_HF[targetLeverage] ?? config.loopTargetHF;
      let maxBorrowUsdc = await borrowExecutor.calculateSafeBorrowAmount(
        0n, currentPosition, targetHF,
      );

      // Cap borrow to reach exact target leverage
      // Target debt = originalDeposit * (targetLeverage - 1)
      // e.g. $40 deposit at 2x → target debt = $40
      const targetDebtUsdc = BigInt(Math.floor(Number(originalDepositUsdc) * (targetLeverage - 1)));
      const currentDebtUsdc = currentPosition.borrowed;
      const remainingDebtNeeded = targetDebtUsdc > currentDebtUsdc ? targetDebtUsdc - currentDebtUsdc : 0n;

      if (remainingDebtNeeded > 0n && remainingDebtNeeded < maxBorrowUsdc) {
        console.log(`[LOOP ${loopId}] Capping borrow: max=${Number(maxBorrowUsdc) / 1e6}, need=${Number(remainingDebtNeeded) / 1e6} to reach ${targetLeverage}x`);
        maxBorrowUsdc = remainingDebtNeeded;
      }

      // Cap by available liquidity in the Morpho pool
      const provider = getProvider();
      const morpho = new ethers.Contract(config.morpho, [
        'function market(bytes32 id) external view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
      ], provider);
      const mkt = await morpho.market(config.morphoMarketId);
      const availableLiquidity = BigInt(mkt[0]) - BigInt(mkt[2]); // totalSupply - totalBorrow
      if (availableLiquidity > 0n && maxBorrowUsdc > availableLiquidity) {
        console.log(`[LOOP ${loopId}] Capping borrow by pool liquidity: ${Number(maxBorrowUsdc) / 1e6} → ${Number(availableLiquidity) / 1e6} USDC`);
        maxBorrowUsdc = availableLiquidity * 95n / 100n; // 95% of available to leave buffer
      }

      // Minimum deposit validation ensures every borrow >= $10, but
      // if somehow we're under $10, stop gracefully
      if (maxBorrowUsdc > 0n && maxBorrowUsdc < 10_000_000n) {
        console.log(`[LOOP ${loopId}] Borrow ${Number(maxBorrowUsdc) / 1e6} USDC too small for CoW — stopping`);
        return { success: false, strcReceived: 0n };
      }

      console.log(`[LOOP ${loopId}] Borrow+swap ${iteration}: borrowing ${Number(maxBorrowUsdc) / 1e6} USDC (current debt: ${Number(currentDebtUsdc) / 1e6}, target: ${Number(targetDebtUsdc) / 1e6})`);

      if (maxBorrowUsdc === 0n) return { success: false, strcReceived: 0n };

      // Borrow
      const borrowCalls = borrowExecutor.buildBorrowCalls(maxBorrowUsdc, smartAccountAddr, smartAccountAddr);
      const borrowHash = await smartAccountService.sendBatchUserOp(privyId, borrowCalls);
      await smartAccountService.waitForReceipt(borrowHash);

      // Approve USDC for CoW
      const cowApproveCalls = approvalExecutor.buildApproveCalls({
        token: config.usdc, spender: config.cowVaultRelayer, amount: maxBorrowUsdc,
      });
      await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, cowApproveCalls));

      // CoW swap USDC → STRC via presign
      const quote = await cowSwapService.getQuote({
        sellToken: config.usdc, buyToken: config.strc, sellAmount: maxBorrowUsdc, from: smartAccountAddr,
      });
      const orderUid = await cowSwapService.createOrder(quote, '');

      const preSignCall = cowSwapService.buildPreSignatureCall(orderUid);
      await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, [preSignCall]));

      // Wait for presign pickup
      for (let i = 0; i < 20; i++) {
        const status = await cowSwapService.pollOrderStatus(orderUid);
        if (status !== 'presignaturePending') break;
        await new Promise(r => setTimeout(r, 3000));
      }

      const fill = await cowSwapService.waitForFill(orderUid);
      console.log(`[LOOP ${loopId}] Borrow+swap ${iteration}: received ${Number(fill.buyAmount) / 1e18} STRC`);

      return { success: true, strcReceived: fill.buyAmount };
    } catch (err) {
      console.error(`[LOOP ${loopId}] Borrow+swap ${iteration} error:`, err instanceof Error ? err.message : err);
      return { success: false, strcReceived: 0n };
    }
  }

  private async updateStage(loopId: string, stage: string): Promise<void> {
    console.log(`[LOOP ${loopId}] Stage: ${stage}`);
    await query(`UPDATE loop_executions SET error = $2 WHERE id = $1 AND status = 'IN_PROGRESS'`, [loopId, `[ACTIVE] ${stage}`]);
  }

  private async failLoop(loopId: string, error: string): Promise<void> {
    console.error(`[LOOP ${loopId}] Failed:`, error);
    await query(`UPDATE loop_executions SET status = 'FAILED', error = $2 WHERE id = $1`, [loopId, error.slice(0, 500)]);
  }
}

export const loopExecutor = new LoopExecutor();
