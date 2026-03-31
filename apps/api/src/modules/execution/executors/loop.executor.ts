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

export class LoopExecutor {
  /**
   * Start a leveraged loop.
   * Runs iterations until target leverage is reached or safety limit hit.
   */
  async startLoop(params: {
    privyId: string;
    strcAmount: bigint;
    targetLeverage: number;
    maxSlippageBps: number;
  }): Promise<string> {
    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(params.privyId);

    // Create execution request
    const { rows: [execReq] } = await query(
      `INSERT INTO execution_requests (privy_id, type, status, smart_account_address)
       VALUES ($1, 'LOOP', 'PENDING', $2) RETURNING id`,
      [params.privyId, smartAccountAddr],
    );

    // Create loop execution record
    const { rows: [loop] } = await query(
      `INSERT INTO loop_executions
       (execution_request_id, privy_id, strc_amount, target_leverage, max_slippage_bps, status)
       VALUES ($1, $2, $3, $4, $5, 'PENDING') RETURNING id`,
      [execReq.id, params.privyId, params.strcAmount.toString(), params.targetLeverage, params.maxSlippageBps],
    );

    // Start loop execution in background (don't await)
    this.runLoop(loop.id, params.privyId, params.strcAmount, params.targetLeverage, params.maxSlippageBps)
      .catch((err) => {
        console.error(`Loop ${loop.id} failed:`, err);
        query(
          `UPDATE loop_executions SET status = 'FAILED', error = $2 WHERE id = $1`,
          [loop.id, err.message],
        );
      });

    return loop.id;
  }

  private async runLoop(
    loopId: string,
    privyId: string,
    initialStrcAmount: bigint,
    targetLeverage: number,
    maxSlippageBps: number,
  ): Promise<void> {
    await query(`UPDATE loop_executions SET status = 'IN_PROGRESS' WHERE id = $1`, [loopId]);

    let currentStrcAmount = initialStrcAmount;
    let iteration = 0;
    let cumulativeSlippageBps = 0;

    while (true) {
      iteration++;

      // Check leverage target
      const smartAccountAddr = await smartAccountService.getSmartAccountAddress(privyId);
      const position = await borrowExecutor.getPosition(smartAccountAddr);

      if (iteration > 1) {
        const currentLeverage = this.calculateLeverage(position);
        if (currentLeverage >= targetLeverage) {
          await this.completeLoop(loopId, iteration - 1, 'COMPLETED');
          return;
        }

        // Health factor check
        const hf = await borrowExecutor.getHealthFactor(smartAccountAddr);
        if (hf > 0 && hf < 1.5) {
          await this.completeLoop(loopId, iteration - 1, 'COMPLETED_PARTIAL');
          return;
        }
      }

      // Cumulative slippage check
      if (cumulativeSlippageBps > 500) {
        await this.completeLoop(loopId, iteration - 1, 'COMPLETED_PARTIAL');
        return;
      }

      // Execute one iteration
      const result = await this.executeIteration(loopId, privyId, iteration, currentStrcAmount, maxSlippageBps);
      cumulativeSlippageBps += result.actualSlippageBps;

      if (!result.success) {
        await this.completeLoop(loopId, iteration, 'FAILED');
        return;
      }

      // The STRC received from CoW swap becomes input for next iteration
      currentStrcAmount = result.strcReceived;
    }
  }

  private async executeIteration(
    loopId: string,
    privyId: string,
    iterationNumber: number,
    strcAmount: bigint,
    maxSlippageBps: number,
  ): Promise<{ success: boolean; strcReceived: bigint; actualSlippageBps: number }> {
    // Create iteration record
    const { rows: [iter] } = await query(
      `INSERT INTO loop_iterations (loop_execution_id, iteration_number, step, strc_deposited, started_at)
       VALUES ($1, $2, 'PENDING', $3, NOW()) RETURNING id`,
      [loopId, iterationNumber, strcAmount.toString()],
    );

    try {
      const smartAccountAddr = await smartAccountService.getSmartAccountAddress(privyId);
      const wstrcIface = new ethers.Interface(wSTRCABI);

      // Build batch calls (steps 1-5)
      const calls: Call[] = [
        // 1. Approve STRC → wSTRC wrapper
        ...approvalExecutor.buildApproveCalls({
          token: config.strc,
          spender: config.wstrc,
          amount: strcAmount,
        }),
        // 2. Wrap STRC → wSTRC
        { to: config.wstrc, data: wstrcIface.encodeFunctionData('wrap', [strcAmount]) },
        // 3. Approve wSTRC → Morpho (MaxUint256 for efficiency)
        ...approvalExecutor.buildApproveCalls({
          token: config.wstrc,
          spender: config.morpho,
          amount: ethers.MaxUint256,
        }),
      ];

      // TODO: Calculate wSTRC amount from wrap, then supply + borrow
      // 4. supplyCollateral(wSTRC)
      // 5. borrow(USDC)
      // These need the actual wSTRC amount from the wrap, which we estimate

      await query(`UPDATE loop_iterations SET step = 'WRAPPING' WHERE id = $1`, [iter.id]);

      // Send batch UserOp
      const userOpHash = await smartAccountService.sendBatchUserOp(privyId, calls);
      await query(`UPDATE loop_iterations SET user_op_hash = $2, step = 'SUPPLYING' WHERE id = $1`, [iter.id, userOpHash]);

      // Wait for receipt
      const receipt = await smartAccountService.waitForReceipt(userOpHash);
      if (!receipt.success) {
        await query(`UPDATE loop_iterations SET step = 'FAILED', error = 'UserOp failed' WHERE id = $1`, [iter.id]);
        return { success: false, strcReceived: 0n, actualSlippageBps: 0 };
      }

      // 6. Swap USDC → STRC via CoW
      await query(`UPDATE loop_iterations SET step = 'SWAPPING' WHERE id = $1`, [iter.id]);

      // TODO: Get borrowed USDC amount from receipt/position
      const usdcBorrowed = 0n; // TODO: Calculate from position diff

      const quote = await cowSwapService.getQuote({
        sellToken: config.usdc,
        buyToken: config.strc,
        sellAmount: usdcBorrowed,
        from: smartAccountAddr,
      });

      // Sign order via Privy
      const wallet = await signerService.getWalletForUser(privyId);
      const signature = await signerService.signTypedData(
        wallet.walletId,
        quote.domain,
        quote.types,
        quote.order,
      );

      const orderUid = await cowSwapService.createOrder(quote, signature);
      await query(`UPDATE loop_iterations SET cow_order_uid = $2 WHERE id = $1`, [iter.id, orderUid]);

      // Wait for CoW fill
      const fill = await cowSwapService.waitForFill(orderUid);
      const actualSlippageBps = quote.expectedBuyAmount > 0n
        ? Number((quote.expectedBuyAmount - fill.buyAmount) * 10000n / quote.expectedBuyAmount)
        : 0;

      // Update iteration as completed
      await query(
        `UPDATE loop_iterations SET
          step = 'COMPLETED',
          usdc_borrowed = $2,
          strc_received = $3,
          actual_slippage_bps = $4,
          completed_at = NOW()
         WHERE id = $1`,
        [iter.id, usdcBorrowed.toString(), fill.buyAmount.toString(), actualSlippageBps],
      );

      // Update loop state
      await query(
        `UPDATE loop_executions SET current_iteration = $2 WHERE id = $1`,
        [loopId, iterationNumber],
      );

      return { success: true, strcReceived: fill.buyAmount, actualSlippageBps };

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await query(`UPDATE loop_iterations SET step = 'FAILED', error = $2 WHERE id = $1`, [iter.id, message]);
      return { success: false, strcReceived: 0n, actualSlippageBps: 0 };
    }
  }

  private async completeLoop(loopId: string, totalIterations: number, status: string): Promise<void> {
    await query(
      `UPDATE loop_executions SET status = $2, current_iteration = $3 WHERE id = $1`,
      [loopId, status, totalIterations],
    );
  }

  private calculateLeverage(position: { collateral: bigint; borrowed: bigint }): number {
    if (position.collateral === 0n) return 1;
    // Leverage = totalExposure / equity = collateral / (collateral - borrowed)
    // This is simplified — real calculation needs oracle prices
    const collateralNum = Number(position.collateral);
    const borrowedNum = Number(position.borrowed);
    if (collateralNum <= borrowedNum) return MAX_LEVERAGE;
    return collateralNum / (collateralNum - borrowedNum);
  }
}

export const loopExecutor = new LoopExecutor();
