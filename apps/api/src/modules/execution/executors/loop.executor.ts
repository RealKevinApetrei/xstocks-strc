import { ethers } from 'ethers';
import { query } from '../../../db/pool';
import { config } from '../../../config';
import { approvalExecutor } from './approval.executor';
import { borrowExecutor } from './borrow.executor';
import { smartAccountService, type Call } from '../smart-account.service';
import { cowSwapService } from '../../cowswap/cowswap.service';
import { signerService } from '../signer.service';
import { MAX_LEVERAGE } from '@xstocks/shared';
import wSTRCABI from '@xstocks/shared/abis/wSTRC.json';
import { pythPriceService } from '../../pyth/pyth-price.service';

const MAX_CUMULATIVE_SLIPPAGE_BPS = 500; // 5%
const LOOP_TARGET_HF = 1.5;

export class LoopExecutor {
  private wstrcIface = new ethers.Interface(wSTRCABI);

  /**
   * Start a leveraged loop.
   * Entry: USDC → swap to STRC → then loop iterations.
   */
  async startLoop(params: {
    privyId: string;
    strcAmount: bigint; // Actually USDC amount (frontend sends USDC)
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
      [execReq.id, params.privyId, params.strcAmount.toString(), params.targetLeverage, params.maxSlippageBps],
    );

    // Run in background
    this.runLoop(loop.id, params.privyId, params.strcAmount, params.targetLeverage, params.maxSlippageBps)
      .catch((err) => {
        console.error(`Loop ${loop.id} failed:`, err);
        query(`UPDATE loop_executions SET status = 'FAILED', error = $2 WHERE id = $1`, [loop.id, err.message]);
      });

    return loop.id;
  }

  private async runLoop(
    loopId: string,
    privyId: string,
    usdcAmount: bigint,
    targetLeverage: number,
    maxSlippageBps: number,
  ): Promise<void> {
    await query(`UPDATE loop_executions SET status = 'IN_PROGRESS' WHERE id = $1`, [loopId]);

    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(privyId);

    // Push fresh Pyth price on-chain before execution
    await pythPriceService.ensureFreshPrice();

    // Step 0: Initial swap USDC → STRC via CoW
    let currentStrcAmount: bigint;
    try {
      currentStrcAmount = await this.initialSwap(privyId, smartAccountAddr, usdcAmount);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Initial USDC→STRC swap failed';
      await query(`UPDATE loop_executions SET status = 'FAILED', error = $2 WHERE id = $1`, [loopId, msg]);
      return;
    }

    let iteration = 0;
    let cumulativeSlippageBps = 0;

    while (true) {
      iteration++;

      // Check leverage target (after first iteration)
      if (iteration > 1) {
        const position = await borrowExecutor.getPosition(smartAccountAddr);
        const currentLeverage = this.calculateLeverage(position.healthFactor);

        if (currentLeverage >= targetLeverage) {
          await query(
            `UPDATE loop_executions SET status = 'COMPLETED', effective_leverage = $2, health_factor = $3, current_iteration = $4 WHERE id = $1`,
            [loopId, currentLeverage, position.healthFactor, iteration - 1],
          );
          return;
        }

        if (position.healthFactor > 0 && position.healthFactor < LOOP_TARGET_HF) {
          await query(
            `UPDATE loop_executions SET status = 'COMPLETED_PARTIAL', effective_leverage = $2, health_factor = $3, current_iteration = $4, error = 'Health factor too low to continue' WHERE id = $1`,
            [loopId, currentLeverage, position.healthFactor, iteration - 1],
          );
          return;
        }
      }

      // Cumulative slippage check
      if (cumulativeSlippageBps > MAX_CUMULATIVE_SLIPPAGE_BPS) {
        await query(
          `UPDATE loop_executions SET status = 'COMPLETED_PARTIAL', current_iteration = $2, error = 'Cumulative slippage exceeded 5%' WHERE id = $1`,
          [loopId, iteration - 1],
        );
        return;
      }

      // Execute one iteration (with auto-retry once on failure)
      let result = await this.executeIteration(loopId, privyId, iteration, currentStrcAmount, maxSlippageBps);

      if (!result.success) {
        // Auto-retry once
        console.log(`Loop ${loopId} iteration ${iteration} failed, retrying once...`);
        result = await this.executeIteration(loopId, privyId, iteration, currentStrcAmount, maxSlippageBps);

        if (!result.success) {
          await query(
            `UPDATE loop_executions SET status = 'COMPLETED_PARTIAL', current_iteration = $2, error = 'Iteration failed after retry' WHERE id = $1`,
            [loopId, iteration],
          );
          return;
        }
      }

      cumulativeSlippageBps += result.actualSlippageBps;
      currentStrcAmount = result.strcReceived;

      await query(`UPDATE loop_executions SET current_iteration = $2 WHERE id = $1`, [loopId, iteration]);
    }
  }

  /**
   * Initial USDC → STRC swap before entering the loop.
   */
  private async initialSwap(privyId: string, smartAccountAddr: string, usdcAmount: bigint): Promise<bigint> {
    // Approve USDC for CoW VaultRelayer
    const approveCalls = approvalExecutor.buildApproveCalls({
      token: config.usdc,
      spender: config.cowVaultRelayer,
      amount: usdcAmount,
    });
    const approveHash = await smartAccountService.sendBatchUserOp(privyId, approveCalls);
    await smartAccountService.waitForReceipt(approveHash);

    // Create CoW swap order
    const quote = await cowSwapService.getQuote({
      sellToken: config.usdc,
      buyToken: config.strc,
      sellAmount: usdcAmount,
      from: smartAccountAddr,
    });

    const wallet = await signerService.getWalletForUser(privyId);
    const signature = await signerService.signTypedData(
      wallet.walletId, quote.domain, quote.types, quote.primaryType, quote.order,
    );

    const orderUid = await cowSwapService.createOrder(quote, signature);
    const fill = await cowSwapService.waitForFill(orderUid);

    return fill.buyAmount;
  }

  /**
   * Execute one loop iteration: wrap → supply → borrow → swap.
   */
  private async executeIteration(
    loopId: string,
    privyId: string,
    iterationNumber: number,
    strcAmount: bigint,
    maxSlippageBps: number,
  ): Promise<{ success: boolean; strcReceived: bigint; actualSlippageBps: number }> {
    const { rows: [iter] } = await query(
      `INSERT INTO loop_iterations (loop_execution_id, iteration_number, step, strc_deposited, started_at)
       VALUES ($1, $2, 'PENDING', $3, NOW()) RETURNING id`,
      [loopId, iterationNumber, strcAmount.toString()],
    );

    try {
      const smartAccountAddr = await smartAccountService.getSmartAccountAddress(privyId);
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const wstrcContract = new ethers.Contract(config.wstrc, wSTRCABI, provider);

      // Calculate expected wSTRC from wrapping
      const wstrcAmount: bigint = await wstrcContract.strcToWstrc(strcAmount);

      // Calculate safe borrow amount
      const currentPosition = await borrowExecutor.getPosition(smartAccountAddr);
      const maxBorrowUsdc = await borrowExecutor.calculateSafeBorrowAmount(
        wstrcAmount, currentPosition, LOOP_TARGET_HF,
      );

      if (maxBorrowUsdc === 0n) {
        await query(`UPDATE loop_iterations SET step = 'COMPLETED', error = 'No safe borrow available', completed_at = NOW() WHERE id = $1`, [iter.id]);
        return { success: false, strcReceived: 0n, actualSlippageBps: 0 };
      }

      // Build batch UserOp: approve → wrap → approve → supply → borrow
      await query(`UPDATE loop_iterations SET step = 'WRAPPING' WHERE id = $1`, [iter.id]);

      const calls: Call[] = [
        // 1. Approve STRC → wSTRC wrapper
        ...approvalExecutor.buildApproveCalls({ token: config.strc, spender: config.wstrc, amount: strcAmount }),
        // 2. Wrap STRC → wSTRC
        { to: config.wstrc, data: this.wstrcIface.encodeFunctionData('wrap', [strcAmount]) },
        // 3. Approve wSTRC → Morpho
        ...approvalExecutor.buildApproveCalls({ token: config.wstrc, spender: config.morpho, amount: wstrcAmount }),
        // 4. Supply collateral
        ...borrowExecutor.buildSupplyCollateralCalls(wstrcAmount, smartAccountAddr),
        // 5. Borrow USDC
        ...borrowExecutor.buildBorrowCalls(maxBorrowUsdc, smartAccountAddr, smartAccountAddr),
      ];

      await query(`UPDATE loop_iterations SET step = 'SUPPLYING' WHERE id = $1`, [iter.id]);
      const userOpHash = await smartAccountService.sendBatchUserOp(privyId, calls);
      await query(`UPDATE loop_iterations SET user_op_hash = $2, step = 'BORROWING' WHERE id = $1`, [iter.id, userOpHash]);

      const receipt = await smartAccountService.waitForReceipt(userOpHash);
      if (!receipt.success) {
        await query(`UPDATE loop_iterations SET step = 'FAILED', error = 'UserOp failed' WHERE id = $1`, [iter.id]);
        return { success: false, strcReceived: 0n, actualSlippageBps: 0 };
      }

      // 6. Approve USDC for CoW VaultRelayer + swap USDC → STRC
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

      const actualSlippageBps = quote.expectedBuyAmount > 0n
        ? Number((quote.expectedBuyAmount - fill.buyAmount) * 10000n / quote.expectedBuyAmount)
        : 0;

      // Update health factor after iteration
      const positionAfter = await borrowExecutor.getPosition(smartAccountAddr);
      const leverageAfter = this.calculateLeverage(positionAfter.healthFactor);

      await query(
        `UPDATE loop_iterations SET step = 'COMPLETED', strc_received = $2, actual_slippage_bps = $3,
         health_factor_after = $4, effective_leverage_after = $5, completed_at = NOW() WHERE id = $1`,
        [iter.id, fill.buyAmount.toString(), actualSlippageBps, positionAfter.healthFactor, leverageAfter],
      );

      return { success: true, strcReceived: fill.buyAmount, actualSlippageBps };

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await query(`UPDATE loop_iterations SET step = 'FAILED', error = $2 WHERE id = $1`, [iter.id, message]);
      return { success: false, strcReceived: 0n, actualSlippageBps: 0 };
    }
  }

  /**
   * Calculate effective leverage from health factor.
   * leverage ≈ 1 / (1 - 1/HF)
   */
  private calculateLeverage(healthFactor: number): number {
    if (healthFactor <= 1) return MAX_LEVERAGE;
    if (healthFactor >= 999) return 1;
    return 1 / (1 - 1 / healthFactor);
  }
}

export const loopExecutor = new LoopExecutor();
