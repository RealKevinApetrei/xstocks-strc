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
   * targetLeverage: 0 = full unwind to USDC, 1/2/3/3.5 = target leverage
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
    // First clear any stale IN_PROGRESS unwinds that might block
    if (position.borrowed === 0n && position.collateral > 0n) {
      console.log(`[UNWIND] Debt is 0 but collateral remains — cleaning up stale unwinds and running final cleanup`);
      await query(
        `UPDATE unwind_executions SET status = 'COMPLETED', error = 'Debt already repaid — running cleanup' WHERE privy_id = $1 AND status IN ('PENDING', 'IN_PROGRESS')`,
        [params.privyId],
      );
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
      let meta: any = {};
      try {
        meta = row.metadata && typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata ?? {});
      } catch {
        console.warn(`[UNWIND ${row.id}] Invalid metadata, defaulting to full unwind`);
      }
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

      // ── Check if target reached ──
      if (this.isTargetReached(position, targetLeverage)) {
        // Full unwind: run comprehensive cleanup
        if (targetLeverage === 0) {
          try {
            await this.verifyFullUnwind(unwindId, privyId, smartAccountAddr);
          } catch (err) {
            console.error(`[UNWIND ${unwindId}] Cleanup failed:`, err instanceof Error ? err.message : err);
          }
        }
        const finalPos = await borrowExecutor.getPosition(smartAccountAddr);
        await query(
          `UPDATE unwind_executions SET status = 'COMPLETED', remaining_debt_usdc = $2,
           remaining_collateral_wstrc = $3, current_step = $4 WHERE id = $1`,
          [unwindId, finalPos.borrowed.toString(), finalPos.collateral.toString(), step],
        );
        console.log(`[UNWIND ${unwindId}] Completed. collateral=${finalPos.collateral}, debt=${finalPos.borrowed}`);
        return;
      }

      // ── Step A: Repay max with any available USDC ──
      await this.repayMaxUsdc(unwindId, privyId, smartAccountAddr);

      // ── Step B: Sell any wallet STRC → USDC and repay ──
      await this.sellWalletStrcAndRepay(unwindId, privyId, smartAccountAddr);

      // ── Step C: Re-read position, check if done ──
      const posAfterRepay = await borrowExecutor.getPosition(smartAccountAddr);
      if (this.isTargetReached(posAfterRepay, targetLeverage)) continue; // loop back to target check

      // ── Step D: Withdraw collateral, unwrap, sell, repay ──
      let withdrawAmount = this.calculateSafeWithdrawAmount(posAfterRepay);

      // Tiny debt (< $1) — just withdraw everything
      if (withdrawAmount === 0n && posAfterRepay.borrowed > 0n && posAfterRepay.borrowed < 1_000_000n) {
        console.log(`[UNWIND ${unwindId}] Tiny debt $${(Number(posAfterRepay.borrowed) / 1e6).toFixed(2)} — force withdrawing all`);
        withdrawAmount = posAfterRepay.collateral;
      }

      if (withdrawAmount === 0n) {
        await query(
          `UPDATE unwind_executions SET status = 'FAILED', current_step = $2,
           error = 'Cannot withdraw — HF ${posAfterRepay.healthFactor.toFixed(2)} too low and no USDC/STRC available' WHERE id = $1`,
          [unwindId, step],
        );
        return;
      }

      let success = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const pos = attempt === 1 ? posAfterRepay : await borrowExecutor.getPosition(smartAccountAddr);
        const amt = attempt === 1 ? withdrawAmount : (this.calculateSafeWithdrawAmount(pos) || pos.collateral);

        success = await this.executeStep(privyId, smartAccountAddr, amt, pos);
        if (success) break;

        if (attempt < 3) {
          const waitSecs = attempt * 15;
          console.log(`[UNWIND ${unwindId}] Step ${step} attempt ${attempt} failed, retrying in ${waitSecs}s...`);
          await query(
            `UPDATE unwind_executions SET error = $2 WHERE id = $1 AND status = 'IN_PROGRESS'`,
            [unwindId, `[ACTIVE] Solver unavailable — retrying in ${waitSecs}s (attempt ${attempt}/3)`],
          );
          await new Promise(r => setTimeout(r, waitSecs * 1000));
          await pythPriceService.ensureFreshPrice();
        }
      }

      if (!success) {
        await query(
          `UPDATE unwind_executions SET status = 'FAILED', current_step = $2, error = 'Step failed after 3 attempts — CoW solvers may be unavailable' WHERE id = $1`,
          [unwindId, step],
        );
        return;
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

  /** Repay as much debt as possible with available USDC in wallet */
  private async repayMaxUsdc(unwindId: string, privyId: string, smartAccountAddr: string): Promise<void> {
    const provider = getProvider();
    const usdc = new ethers.Contract(config.usdc, ['function balanceOf(address) view returns (uint256)'], provider);
    const usdcBal: bigint = await usdc.balanceOf(smartAccountAddr);
    const pos = await borrowExecutor.getPosition(smartAccountAddr);

    if (usdcBal > 0n && pos.borrowed > 0n) {
      // If we have enough USDC to repay full debt, use shares for exact closure
      const canRepayFull = usdcBal >= pos.borrowed;
      const approveAmt = canRepayFull ? pos.borrowed + 1_000n : usdcBal; // +buffer for rounding
      console.log(`[UNWIND ${unwindId}] Repaying ${canRepayFull ? 'FULL' : 'partial'} debt: ${Number(canRepayFull ? pos.borrowed : usdcBal) / 1e6} USDC (have ${Number(usdcBal) / 1e6}, owe ${Number(pos.borrowed) / 1e6})`);

      const approveCalls = approvalExecutor.buildApproveCalls({ token: config.usdc, spender: config.morpho, amount: approveAmt });
      await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, approveCalls));

      // Full repay: use borrow shares to avoid rounding issues
      const repayCalls = canRepayFull
        ? borrowExecutor.buildRepayCalls(0n, smartAccountAddr, true, pos.borrowShares)
        : borrowExecutor.buildRepayCalls(usdcBal, smartAccountAddr);
      await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, repayCalls));
    }
  }

  /** Unwrap any wSTRC in wallet, sell STRC → USDC via CoW, then repay debt */
  private async sellWalletStrcAndRepay(unwindId: string, privyId: string, smartAccountAddr: string): Promise<void> {
    const provider = getProvider();

    // First: unwrap any wSTRC sitting in the wallet
    const wstrc = new ethers.Contract(config.wstrc, ['function balanceOf(address) view returns (uint256)'], provider);
    const wstrcBal: bigint = await wstrc.balanceOf(smartAccountAddr);
    if (wstrcBal > STRC_DUST) {
      console.log(`[UNWIND ${unwindId}] Unwrapping ${Number(wstrcBal) / 1e18} wSTRC from wallet`);
      const unwrapHash = await smartAccountService.sendBatchUserOp(privyId, [
        { to: config.wstrc, data: this.wstrcIface.encodeFunctionData('unwrap', [wstrcBal]) },
      ]);
      await smartAccountService.waitForReceipt(unwrapHash);
    }

    const strcContract = new ethers.Contract(config.strc, ['function balanceOf(address) view returns (uint256)'], provider);
    const strcBal: bigint = await strcContract.balanceOf(smartAccountAddr);
    const strcUsd = Number(strcBal) / 1e18 * 100;

    if (strcBal <= STRC_DUST || strcUsd < 10) return;

    console.log(`[UNWIND ${unwindId}] Selling ${Number(strcBal) / 1e18} STRC (~$${strcUsd.toFixed(2)}) → USDC`);
    try {
      const aCalls = approvalExecutor.buildApproveCalls({ token: config.strc, spender: config.cowVaultRelayer, amount: strcBal });
      await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, aCalls));

      const quote = await cowSwapService.getQuote({ sellToken: config.strc, buyToken: config.usdc, sellAmount: strcBal, from: smartAccountAddr });
      const orderUid = await cowSwapService.createOrder(quote, '');
      const preSignCall = cowSwapService.buildPreSignatureCall(orderUid);
      await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, [preSignCall]));

      for (let i = 0; i < 20; i++) {
        const status = await cowSwapService.pollOrderStatus(orderUid);
        if (status !== 'presignaturePending') break;
        await new Promise(r => setTimeout(r, 3000));
      }
      await cowSwapService.waitForFill(orderUid);
      console.log(`[UNWIND ${unwindId}] STRC → USDC swap complete`);

      // Repay with the USDC we got
      await this.repayMaxUsdc(unwindId, privyId, smartAccountAddr);
    } catch (err) {
      console.warn(`[UNWIND ${unwindId}] STRC sell failed:`, err instanceof Error ? err.message : err);
    }
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

  /**
   * Final verification for full unwind — clean up any leftovers.
   * Checks: Morpho collateral, Morpho debt, wSTRC balance, STRC balance.
   */
  private async verifyFullUnwind(unwindId: string, privyId: string, smartAccountAddr: string): Promise<void> {
    console.log(`[UNWIND ${unwindId}] Running full unwind verification...`);
    const provider = getProvider();

    // 1. Check Morpho position — withdraw any remaining collateral
    const pos = await borrowExecutor.getPosition(smartAccountAddr);
    if (pos.collateral > STRC_DUST) {
      console.log(`[UNWIND ${unwindId}] Remaining collateral: ${pos.collateral} — withdrawing`);
      const withdrawCalls = borrowExecutor.buildWithdrawCollateralCalls(pos.collateral, smartAccountAddr, smartAccountAddr);
      await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, withdrawCalls));
    }

    // 2. Unwrap any wSTRC in wallet
    const wstrc = new ethers.Contract(config.wstrc, ['function balanceOf(address) view returns (uint256)'], provider);
    const wstrcBal: bigint = await wstrc.balanceOf(smartAccountAddr);
    if (wstrcBal > STRC_DUST) {
      console.log(`[UNWIND ${unwindId}] Remaining wSTRC: ${Number(wstrcBal) / 1e18} — unwrapping`);
      const unwrapHash = await smartAccountService.sendBatchUserOp(privyId, [
        { to: config.wstrc, data: this.wstrcIface.encodeFunctionData('unwrap', [wstrcBal]) },
      ]);
      await smartAccountService.waitForReceipt(unwrapHash);
    }

    // 3. Swap any STRC to USDC
    const strc = new ethers.Contract(config.strc, ['function balanceOf(address) view returns (uint256)'], provider);
    const strcBal: bigint = await strc.balanceOf(smartAccountAddr);
    const strcValueUsd = Number(strcBal) / 1e18 * 100;

    if (strcBal > STRC_DUST && strcValueUsd >= 10) {
      console.log(`[UNWIND ${unwindId}] Remaining STRC: ${Number(strcBal) / 1e18} (~$${strcValueUsd.toFixed(2)}) — swapping to USDC`);
      const aCalls = approvalExecutor.buildApproveCalls({ token: config.strc, spender: config.cowVaultRelayer, amount: strcBal });
      await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, aCalls));

      const quote = await cowSwapService.getQuote({ sellToken: config.strc, buyToken: config.usdc, sellAmount: strcBal, from: smartAccountAddr });
      const orderUid = await cowSwapService.createOrder(quote, '');
      const preSignCall = cowSwapService.buildPreSignatureCall(orderUid);
      await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, [preSignCall]));

      for (let i = 0; i < 20; i++) {
        const status = await cowSwapService.pollOrderStatus(orderUid);
        if (status !== 'presignaturePending') break;
        await new Promise(r => setTimeout(r, 3000));
      }

      await cowSwapService.waitForFill(orderUid);
      console.log(`[UNWIND ${unwindId}] STRC → USDC swap complete`);
    } else if (strcBal > STRC_DUST) {
      console.log(`[UNWIND ${unwindId}] Remaining STRC worth ~$${strcValueUsd.toFixed(2)} — too small for CoW, leaving as is`);
    }

    // 4. Repay any remaining debt with available USDC
    const finalPos = await borrowExecutor.getPosition(smartAccountAddr);
    if (finalPos.borrowed > 0n) {
      const usdc = new ethers.Contract(config.usdc, ['function balanceOf(address) view returns (uint256)'], provider);
      const usdcBal: bigint = await usdc.balanceOf(smartAccountAddr);
      if (usdcBal > 0n) {
        const repayAmount = usdcBal < finalPos.borrowed ? usdcBal : finalPos.borrowed;
        console.log(`[UNWIND ${unwindId}] Repaying remaining debt: ${Number(repayAmount) / 1e6} USDC`);
        const approveCalls = approvalExecutor.buildApproveCalls({ token: config.usdc, spender: config.morpho, amount: repayAmount });
        await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, approveCalls));
        const repayCalls = borrowExecutor.buildRepayCalls(repayAmount, smartAccountAddr);
        await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, repayCalls));
      }
    }

    console.log(`[UNWIND ${unwindId}] Full unwind verification complete`);
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
