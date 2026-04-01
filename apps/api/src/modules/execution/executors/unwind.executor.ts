import { ethers } from 'ethers';
import { query } from '../../../db/pool';
import { config } from '../../../config';
import { borrowExecutor, type MorphoPosition } from './borrow.executor';
import { smartAccountService } from '../smart-account.service';
import { cowSwapService } from '../../cowswap/cowswap.service';
import { approvalExecutor } from './approval.executor';
import { STRC_DUST } from '@xstocks/shared';
import wSTRCABI from '@xstocks/shared/abis/wSTRC.json';
import { pythPriceService } from '../../pyth/pyth-price.service';

const UNWIND_SAFETY_MARGIN = 0.95;

import { getProvider } from '../../../lib/provider';

export class UnwindExecutor {
  private wstrcIface = new ethers.Interface(wSTRCABI);

  /** Track active unwinds in memory for recovery */
  private activeUnwinds = new Map<string, { privyId: string; targetLeverage: number }>();

  /**
   * Start unwinding to a target leverage.
   * targetLeverage: 0 = full unwind to USDC, 1/2/3/5 = target leverage
   */
  async startUnwind(params: {
    privyId: string;
    loopExecutionId: string;
    targetLeverage?: number;
  }): Promise<string> {
    const targetLeverage = params.targetLeverage ?? 0;
    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(params.privyId);
    const position = await borrowExecutor.getPosition(smartAccountAddr);

    if (position.borrowed === 0n && position.collateral === 0n) {
      throw new Error('No position to unwind — already fully closed');
    }

    // If debt is 0 but collateral remains, run finalCleanup directly
    if (position.borrowed === 0n && position.collateral > 0n) {
      console.log(`[UNWIND] Debt is 0 but collateral remains — running final cleanup`);
      await this.finalCleanup(params.privyId, smartAccountAddr, position);
      return 'cleanup-complete';
    }

    const { rows: [execReq] } = await query(
      `INSERT INTO execution_requests (privy_id, type, status, smart_account_address)
       VALUES ($1, 'UNWIND', 'PENDING', $2) RETURNING id`,
      [params.privyId, smartAccountAddr],
    );

    const { rows: [unwind] } = await query(
      `INSERT INTO unwind_executions
       (execution_request_id, loop_execution_id, privy_id, initial_debt_usdc, initial_collateral_wstrc,
        remaining_debt_usdc, remaining_collateral_wstrc, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $4, $5, 'PENDING', $6) RETURNING id`,
      [execReq.id, params.loopExecutionId, params.privyId,
       position.borrowed.toString(), position.collateral.toString(),
       JSON.stringify({ targetLeverage })],
    );

    this.launchUnwind(unwind.id, params.privyId, targetLeverage);
    return unwind.id;
  }

  /**
   * Resume any IN_PROGRESS unwinds after server restart.
   */
  async resumeActiveUnwinds(): Promise<void> {
    const { rows } = await query(
      `SELECT u.id, u.privy_id, u.metadata FROM unwind_executions u WHERE u.status = 'IN_PROGRESS'`,
    );
    for (const row of rows) {
      const meta = row.metadata ? JSON.parse(row.metadata) : {};
      console.log(`[UNWIND ${row.id}] Resuming after restart...`);
      this.launchUnwind(row.id, row.privy_id, meta.targetLeverage ?? 0);
    }
    if (rows.length > 0) console.log(`Resumed ${rows.length} active unwind(s)`);
  }

  private launchUnwind(unwindId: string, privyId: string, targetLeverage: number): void {
    this.activeUnwinds.set(unwindId, { privyId, targetLeverage });

    this.runUnwind(unwindId, privyId, targetLeverage)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[UNWIND ${unwindId}] Fatal:`, msg);
        query(`UPDATE unwind_executions SET status = 'FAILED', error = $2 WHERE id = $1`, [unwindId, msg.slice(0, 500)])
          .catch((dbErr) => console.error(`[UNWIND ${unwindId}] DB update also failed:`, dbErr));
      })
      .finally(() => this.activeUnwinds.delete(unwindId));
  }

  isActive(unwindId: string): boolean {
    return this.activeUnwinds.has(unwindId);
  }

  private async runUnwind(unwindId: string, privyId: string, targetLeverage: number): Promise<void> {
    await query(`UPDATE unwind_executions SET status = 'IN_PROGRESS' WHERE id = $1`, [unwindId]);
    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(privyId);
    console.log(`[UNWIND ${unwindId}] Starting unwind to ${targetLeverage}x for ${smartAccountAddr}`);

    await pythPriceService.ensureFreshPrice();

    for (let step = 1; step <= config.maxUnwindSteps; step++) {
      const position = await borrowExecutor.getPosition(smartAccountAddr);
      console.log(`[UNWIND ${unwindId}] Step ${step}: collateral=${position.collateral}, borrowed=${position.borrowed}, HF=${position.healthFactor.toFixed(2)}`);

      // Target reached?
      if (this.isTargetReached(position, targetLeverage)) {
        if (targetLeverage === 0 && position.collateral > 0n && position.borrowed === 0n) {
          await this.finalCleanup(privyId, smartAccountAddr, position);
        }
        await query(
          `UPDATE unwind_executions SET status = 'COMPLETED', remaining_debt_usdc = $2,
           remaining_collateral_wstrc = $3, current_step = $4 WHERE id = $1`,
          [unwindId, position.borrowed.toString(), position.collateral.toString(), step],
        );
        return;
      }

      let safeWithdrawWstrc = this.calculateSafeWithdrawAmount(position);

      if (safeWithdrawWstrc === 0n && position.borrowed > 0n) {
        // HF too low to withdraw — try repaying with available USDC first
        console.log(`[UNWIND ${unwindId}] HF ${position.healthFactor.toFixed(2)} too low to withdraw, trying to repay USDC first`);
        const provider = getProvider();
        const usdc = new ethers.Contract(config.usdc, ['function balanceOf(address) view returns (uint256)'], provider);
        const usdcBalance: bigint = await usdc.balanceOf(smartAccountAddr);

        if (usdcBalance > 0n) {
          const repayAmount = usdcBalance < position.borrowed ? usdcBalance : position.borrowed;
          console.log(`[UNWIND ${unwindId}] Repaying ${Number(repayAmount) / 1e6} USDC to raise HF`);

          const approveCalls = approvalExecutor.buildApproveCalls({ token: config.usdc, spender: config.morpho, amount: repayAmount });
          await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, approveCalls));

          const repayCalls = borrowExecutor.buildRepayCalls(repayAmount, smartAccountAddr);
          await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, repayCalls));

          // Re-check position after repay
          const freshPos = await borrowExecutor.getPosition(smartAccountAddr);
          console.log(`[UNWIND ${unwindId}] After repay: collateral=${freshPos.collateral}, borrowed=${freshPos.borrowed}, HF=${freshPos.healthFactor.toFixed(2)}`);
          safeWithdrawWstrc = this.calculateSafeWithdrawAmount(freshPos);
        }

        if (safeWithdrawWstrc === 0n) {
          await query(
            `UPDATE unwind_executions SET status = 'FAILED', current_step = $2,
             error = 'Cannot safely withdraw — HF ${position.healthFactor.toFixed(2)} too close to liquidation' WHERE id = $1`,
            [unwindId, step],
          );
          return;
        }
      }

      // Execute step with retry
      let success = await this.executeStep(privyId, smartAccountAddr, safeWithdrawWstrc, position);

      if (!success) {
        console.log(`[UNWIND ${unwindId}] Step ${step} failed, retrying...`);
        await pythPriceService.ensureFreshPrice();
        const freshPos = await borrowExecutor.getPosition(smartAccountAddr);
        const freshWithdraw = this.calculateSafeWithdrawAmount(freshPos);
        if (freshWithdraw > 0n) {
          success = await this.executeStep(privyId, smartAccountAddr, freshWithdraw, freshPos);
        }
        if (!success) {
          await query(
            `UPDATE unwind_executions SET status = 'FAILED', current_step = $2, error = 'Step failed after retry' WHERE id = $1`,
            [unwindId, step],
          );
          return;
        }
      }

      const posAfter = await borrowExecutor.getPosition(smartAccountAddr);
      await query(
        `UPDATE unwind_executions SET current_step = $2, remaining_debt_usdc = $3, remaining_collateral_wstrc = $4 WHERE id = $1`,
        [unwindId, step, posAfter.borrowed.toString(), posAfter.collateral.toString()],
      );
    }

    await query(
      `UPDATE unwind_executions SET status = 'FAILED', error = 'Max ${config.maxUnwindSteps} steps reached' WHERE id = $1`,
      [unwindId],
    );
  }

  private async executeStep(
    privyId: string, smartAccountAddr: string, withdrawWstrc: bigint, position: MorphoPosition,
  ): Promise<boolean> {
    try {
      // 1. Withdraw collateral
      console.log(`[UNWIND] Withdrawing ${withdrawWstrc} wSTRC collateral...`);
      const withdrawCalls = borrowExecutor.buildWithdrawCollateralCalls(withdrawWstrc, smartAccountAddr, smartAccountAddr);
      const wHash = await smartAccountService.sendBatchUserOp(privyId, withdrawCalls);
      await smartAccountService.waitForReceipt(wHash);

      // 2. Unwrap wSTRC → STRC
      console.log(`[UNWIND] Unwrapping wSTRC → STRC...`);
      const unwrapHash = await smartAccountService.sendBatchUserOp(privyId, [
        { to: config.wstrc, data: this.wstrcIface.encodeFunctionData('unwrap', [withdrawWstrc]) },
      ]);
      await smartAccountService.waitForReceipt(unwrapHash);

      // 2. Get STRC amount
      const provider = getProvider();
      const wstrcContract = new ethers.Contract(config.wstrc, wSTRCABI, provider);
      const strcAmount: bigint = await wstrcContract.wstrcToStrc(withdrawWstrc);
      if (strcAmount <= STRC_DUST) throw new Error('Unwrap returned dust');

      // 3. Approve STRC for CoW
      console.log(`[UNWIND] Approving STRC for CoW VaultRelayer...`);
      const aCalls = approvalExecutor.buildApproveCalls({ token: config.strc, spender: config.cowVaultRelayer, amount: strcAmount });
      await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, aCalls));

      // 4. CoW swap STRC → USDC via presign
      console.log(`[UNWIND] Getting CoW quote STRC → USDC...`);
      const quote = await cowSwapService.getQuote({ sellToken: config.strc, buyToken: config.usdc, sellAmount: strcAmount, from: smartAccountAddr });

      console.log(`[UNWIND] Submitting CoW presign order...`);
      const orderUid = await cowSwapService.createOrder(quote, '');

      console.log(`[UNWIND] Pre-signing order on-chain...`);
      const preSignCall = cowSwapService.buildPreSignatureCall(orderUid);
      const preSignHash = await smartAccountService.sendBatchUserOp(privyId, [preSignCall]);
      await smartAccountService.waitForReceipt(preSignHash);

      // Wait for presign to be picked up
      for (let i = 0; i < 20; i++) {
        const status = await cowSwapService.pollOrderStatus(orderUid);
        console.log(`[UNWIND] CoW order status: ${status}`);
        if (status !== 'presignaturePending') break;
        await new Promise(r => setTimeout(r, 3000));
      }

      console.log(`[UNWIND] Waiting for CoW fill...`);
      const fill = await cowSwapService.waitForFill(orderUid);
      if (fill.buyAmount <= 0n) throw new Error('CoW returned 0 USDC');

      // 5. Approve USDC for Morpho repay
      console.log(`[UNWIND] Approving USDC for Morpho repay...`);
      const freshPos = await borrowExecutor.getPosition(smartAccountAddr);
      const debtToRepay = freshPos.borrowed < fill.buyAmount ? freshPos.borrowed : fill.buyAmount;
      console.log(`[UNWIND] Repaying ${Number(debtToRepay) / 1e6} USDC (debt: ${Number(freshPos.borrowed) / 1e6}, received: ${Number(fill.buyAmount) / 1e6})`);

      const approveCalls = approvalExecutor.buildApproveCalls({ token: config.usdc, spender: config.morpho, amount: debtToRepay });
      await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, approveCalls));

      // 6. Repay debt
      console.log(`[UNWIND] Repaying debt on Morpho...`);
      const repayCalls = borrowExecutor.buildRepayCalls(debtToRepay, smartAccountAddr);
      const rReceipt = await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, repayCalls));
      if (!rReceipt.success) throw new Error('Repay reverted');

      return true;
    } catch (err) {
      console.error('[UNWIND] Step error:', err instanceof Error ? err.message : err);
      return false;
    }
  }

  private async finalCleanup(privyId: string, smartAccountAddr: string, position: MorphoPosition): Promise<void> {
    if (position.collateral <= 0n) return;
    console.log(`[UNWIND] Final cleanup: withdrawing remaining ${position.collateral} wSTRC collateral`);

    // Withdraw remaining collateral
    const withdrawCalls = borrowExecutor.buildWithdrawCollateralCalls(position.collateral, smartAccountAddr, smartAccountAddr);
    await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, withdrawCalls));

    // Unwrap wSTRC → STRC
    console.log(`[UNWIND] Unwrapping remaining wSTRC → STRC`);
    const unwrapHash = await smartAccountService.sendBatchUserOp(privyId, [
      { to: config.wstrc, data: this.wstrcIface.encodeFunctionData('unwrap', [position.collateral]) },
    ]);
    await smartAccountService.waitForReceipt(unwrapHash);

    // Swap remaining STRC → USDC via CoW presign
    const provider = getProvider();
    const strcContract = new ethers.Contract(config.strc, ['function balanceOf(address) view returns (uint256)'], provider);
    const strcBalance: bigint = await strcContract.balanceOf(smartAccountAddr);

    if (strcBalance > STRC_DUST) {
      console.log(`[UNWIND] Swapping remaining ${Number(strcBalance) / 1e18} STRC → USDC`);
      const aCalls = approvalExecutor.buildApproveCalls({ token: config.strc, spender: config.cowVaultRelayer, amount: strcBalance });
      await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, aCalls));

      const quote = await cowSwapService.getQuote({ sellToken: config.strc, buyToken: config.usdc, sellAmount: strcBalance, from: smartAccountAddr });
      const orderUid = await cowSwapService.createOrder(quote, '');
      const preSignCall = cowSwapService.buildPreSignatureCall(orderUid);
      await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, [preSignCall]));
      await cowSwapService.waitForFill(orderUid);
      console.log(`[UNWIND] Final STRC → USDC swap complete`);
    }
  }

  private isTargetReached(position: MorphoPosition, targetLeverage: number): boolean {
    if (targetLeverage === 0) return position.borrowed === 0n;
    if (position.borrowed === 0n) return true;
    return borrowExecutor.calculateLeverage(position.healthFactor) <= targetLeverage;
  }

  private calculateSafeWithdrawAmount(position: MorphoPosition): bigint {
    if (position.borrowed === 0n) return position.collateral;
    if (position.healthFactor <= config.unwindMinHF) return 0n;

    // Pure bigint math to avoid precision loss on large collateral amounts.
    // fraction = (1 - minHF/HF) * safetyMargin
    // Scale: multiply by 10000 for 4-decimal precision
    const SCALE = 10000n;
    const hfScaled = BigInt(Math.round(position.healthFactor * 10000));
    const minHfScaled = BigInt(Math.round(config.unwindMinHF * 10000));
    const safetyScaled = BigInt(Math.round(UNWIND_SAFETY_MARGIN * 10000));

    if (hfScaled <= minHfScaled) return 0n;

    // fraction = ((hf - minHF) / hf) * safety = ((hfScaled - minHfScaled) * safetyScaled) / (hfScaled * SCALE)
    const amount = (position.collateral * (hfScaled - minHfScaled) * safetyScaled) / (hfScaled * SCALE);
    return amount > STRC_DUST ? amount : 0n;
  }
}

export const unwindExecutor = new UnwindExecutor();
