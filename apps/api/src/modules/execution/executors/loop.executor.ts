import { ethers } from 'ethers';
import { query } from '../../../db/pool';
import { config } from '../../../config';
import { approvalExecutor } from './approval.executor';
import { borrowExecutor } from './borrow.executor';
import { smartAccountService, type Call } from '../smart-account.service';
import { cowSwapService } from '../../cowswap/cowswap.service';
import { signerService } from '../signer.service';
import { MAX_LEVERAGE, STRC_DUST } from '@xstocks/shared';
import wSTRCABI from '@xstocks/shared/abis/wSTRC.json';
import { pythPriceService } from '../../pyth/pyth-price.service';

export class LoopExecutor {
  private wstrcIface = new ethers.Interface(wSTRCABI);

  /** Track active loops in memory for state awareness */
  private activeLoops = new Map<string, { privyId: string; targetLeverage: number }>();

  isActive(loopId: string): boolean {
    return this.activeLoops.has(loopId);
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
      .finally(() => this.activeLoops.delete(loop.id));

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
    await pythPriceService.ensureFreshPrice();

    // Step 0: Initial swap USDC → STRC via CoW
    let currentStrcAmount: bigint;
    try {
      currentStrcAmount = await this.initialSwap(privyId, smartAccountAddr, usdcAmount);
      if (currentStrcAmount <= STRC_DUST) {
        await this.failLoop(loopId, 'Initial swap returned dust amount — insufficient STRC received');
        return;
      }
    } catch (err) {
      await this.failLoop(loopId, `Initial USDC→STRC swap failed: ${err instanceof Error ? err.message : 'Unknown'}`);
      return;
    }

    // Loop iterations
    for (let iteration = 1; iteration <= config.maxLoopIterations; iteration++) {
      // Read fresh position before each iteration
      const position = await borrowExecutor.getPosition(smartAccountAddr);

      // Emergency stop: HF in liquidation danger zone
      if (position.borrowed > 0n && position.healthFactor < config.emergencyHF) {
        await query(
          `UPDATE loop_executions SET status = 'COMPLETED_PARTIAL', current_iteration = $2, health_factor = $3,
           effective_leverage = $4, error = 'Emergency stop: health factor below ${config.emergencyHF}' WHERE id = $1`,
          [loopId, iteration - 1, position.healthFactor, borrowExecutor.calculateLeverage(position.healthFactor)],
        );
        return;
      }

      // Check if target leverage reached
      if (iteration > 1) {
        const currentLeverage = borrowExecutor.calculateLeverage(position.healthFactor);
        if (currentLeverage >= targetLeverage) {
          await query(
            `UPDATE loop_executions SET status = 'COMPLETED', current_iteration = $2, health_factor = $3,
             effective_leverage = $4 WHERE id = $1`,
            [loopId, iteration - 1, position.healthFactor, currentLeverage],
          );
          return;
        }

        // HF too low to continue safely
        if (position.healthFactor < config.loopTargetHF && position.borrowed > 0n) {
          await query(
            `UPDATE loop_executions SET status = 'COMPLETED_PARTIAL', current_iteration = $2, health_factor = $3,
             effective_leverage = $4, error = 'Health factor too low to add more leverage' WHERE id = $1`,
            [loopId, iteration - 1, position.healthFactor, currentLeverage],
          );
          return;
        }
      }

      // Execute iteration (with auto-retry once on failure)
      let result = await this.executeIteration(loopId, privyId, smartAccountAddr, iteration, currentStrcAmount);

      if (!result.success) {
        // Retry once with fresh position state
        console.log(`[LOOP ${loopId}] Iteration ${iteration} failed, retrying once...`);
        await pythPriceService.ensureFreshPrice(); // Refresh price before retry
        result = await this.executeIteration(loopId, privyId, smartAccountAddr, iteration, currentStrcAmount);

        if (!result.success) {
          const posAfter = await borrowExecutor.getPosition(smartAccountAddr);
          await query(
            `UPDATE loop_executions SET status = 'COMPLETED_PARTIAL', current_iteration = $2, health_factor = $3,
             effective_leverage = $4, error = 'Iteration failed after retry' WHERE id = $1`,
            [loopId, iteration, posAfter.healthFactor, borrowExecutor.calculateLeverage(posAfter.healthFactor)],
          );
          return;
        }
      }

      // Validate CoW fill returned meaningful STRC
      if (result.strcReceived <= STRC_DUST) {
        const posAfter = await borrowExecutor.getPosition(smartAccountAddr);
        await query(
          `UPDATE loop_executions SET status = 'COMPLETED_PARTIAL', current_iteration = $2, health_factor = $3,
           effective_leverage = $4, error = 'CoW swap returned dust — stopping' WHERE id = $1`,
          [loopId, iteration, posAfter.healthFactor, borrowExecutor.calculateLeverage(posAfter.healthFactor)],
        );
        return;
      }

      currentStrcAmount = result.strcReceived;
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
  private async initialSwap(privyId: string, smartAccountAddr: string, usdcAmount: bigint): Promise<bigint> {
    // Approve USDC for CoW VaultRelayer
    const approveCalls = approvalExecutor.buildApproveCalls({
      token: config.usdc, spender: config.cowVaultRelayer, amount: usdcAmount,
    });
    const approveHash = await smartAccountService.sendBatchUserOp(privyId, approveCalls);
    await smartAccountService.waitForReceipt(approveHash);

    // CoW swap USDC → STRC
    const quote = await cowSwapService.getQuote({
      sellToken: config.usdc, buyToken: config.strc, sellAmount: usdcAmount, from: smartAccountAddr,
    });

    const wallet = await signerService.getWalletForUser(privyId);
    const signature = await signerService.signTypedData(
      wallet.walletId, quote.domain, quote.types, quote.primaryType, quote.order, privyId,
    );

    const orderUid = await cowSwapService.createOrder(quote, signature);
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
  ): Promise<{ success: boolean; strcReceived: bigint }> {
    const { rows: [iter] } = await query(
      `INSERT INTO loop_iterations (loop_execution_id, iteration_number, step, strc_deposited, started_at)
       VALUES ($1, $2, 'PENDING', $3, NOW()) RETURNING id`,
      [loopId, iterationNumber, strcAmount.toString()],
    );

    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const wstrcContract = new ethers.Contract(config.wstrc, wSTRCABI, provider);

      // Calculate expected wSTRC from wrapping
      const wstrcAmount: bigint = await wstrcContract.strcToWstrc(strcAmount);
      if (wstrcAmount <= 0n) {
        throw new Error('wSTRC amount rounds to zero');
      }

      // Calculate safe borrow amount
      const currentPosition = await borrowExecutor.getPosition(smartAccountAddr);
      const maxBorrowUsdc = await borrowExecutor.calculateSafeBorrowAmount(
        wstrcAmount, currentPosition, config.loopTargetHF,
      );

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

      const wallet = await signerService.getWalletForUser(privyId);
      const signature = await signerService.signTypedData(
        wallet.walletId, quote.domain, quote.types, quote.primaryType, quote.order,
      );

      const orderUid = await cowSwapService.createOrder(quote, signature);
      await query(`UPDATE loop_iterations SET cow_order_uid = $2 WHERE id = $1`, [iter.id, orderUid]);

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

  private async failLoop(loopId: string, error: string): Promise<void> {
    console.error(`[LOOP ${loopId}] Failed:`, error);
    await query(`UPDATE loop_executions SET status = 'FAILED', error = $2 WHERE id = $1`, [loopId, error.slice(0, 500)]);
  }
}

export const loopExecutor = new LoopExecutor();
