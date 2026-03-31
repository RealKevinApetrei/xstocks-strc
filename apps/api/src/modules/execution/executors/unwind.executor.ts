import { ethers } from 'ethers';
import { query } from '../../../db/pool';
import { config } from '../../../config';
import { borrowExecutor, type MorphoPosition } from './borrow.executor';
import { smartAccountService } from '../smart-account.service';
import { cowSwapService } from '../../cowswap/cowswap.service';
import { signerService } from '../signer.service';
import { approvalExecutor } from './approval.executor';
import { STRC_DUST } from '@xstocks/shared';
import wSTRCABI from '@xstocks/shared/abis/wSTRC.json';
import { pythPriceService } from '../../pyth/pyth-price.service';

const UNWIND_SAFETY_MARGIN = 0.95;

let _provider: ethers.JsonRpcProvider | null = null;
function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) _provider = new ethers.JsonRpcProvider(config.rpcUrl);
  return _provider;
}

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

    if (position.borrowed === 0n) {
      throw new Error('No debt to repay — position already unwound');
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

    await pythPriceService.ensureFreshPrice();

    for (let step = 1; step <= config.maxUnwindSteps; step++) {
      const position = await borrowExecutor.getPosition(smartAccountAddr);

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

      const safeWithdrawWstrc = this.calculateSafeWithdrawAmount(position);

      if (safeWithdrawWstrc === 0n) {
        await query(
          `UPDATE unwind_executions SET status = 'FAILED', current_step = $2,
           error = 'Cannot safely withdraw — HF ${position.healthFactor.toFixed(2)} too close to liquidation' WHERE id = $1`,
          [unwindId, step],
        );
        return;
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
      // 1. Withdraw + unwrap
      const withdrawCalls = [
        ...borrowExecutor.buildWithdrawCollateralCalls(withdrawWstrc, smartAccountAddr, smartAccountAddr),
        { to: config.wstrc, data: this.wstrcIface.encodeFunctionData('unwrap', [withdrawWstrc]) },
      ];
      const wHash = await smartAccountService.sendBatchUserOp(privyId, withdrawCalls);
      const wReceipt = await smartAccountService.waitForReceipt(wHash);
      if (!wReceipt.success) throw new Error('Withdraw reverted');

      // 2. Get STRC amount
      const provider = getProvider();
      const wstrcContract = new ethers.Contract(config.wstrc, wSTRCABI, provider);
      const strcAmount: bigint = await wstrcContract.wstrcToStrc(withdrawWstrc);
      if (strcAmount <= STRC_DUST) throw new Error('Unwrap returned dust');

      // 3. Approve + CoW swap STRC → USDC
      const aCalls = approvalExecutor.buildApproveCalls({ token: config.strc, spender: config.cowVaultRelayer, amount: strcAmount });
      await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, aCalls));

      const quote = await cowSwapService.getQuote({ sellToken: config.strc, buyToken: config.usdc, sellAmount: strcAmount, from: smartAccountAddr });
      const wallet = await signerService.getWalletForUser(privyId);
      const sig = await signerService.signTypedData(wallet.walletId, quote.domain, quote.types, quote.primaryType, quote.order, privyId);
      const orderUid = await cowSwapService.createOrder(quote, sig);
      const fill = await cowSwapService.waitForFill(orderUid);
      if (fill.buyAmount <= 0n) throw new Error('CoW returned 0 USDC');

      // 4. Read fresh debt (interest accrued during CoW fill) + repay
      const freshPos = await borrowExecutor.getPosition(smartAccountAddr);
      const debtToRepay = freshPos.borrowed < fill.buyAmount ? freshPos.borrowed : fill.buyAmount;
      const rCalls = [
        ...approvalExecutor.buildApproveCalls({ token: config.usdc, spender: config.morpho, amount: debtToRepay }),
        ...borrowExecutor.buildRepayCalls(debtToRepay, smartAccountAddr),
      ];
      const rReceipt = await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, rCalls));
      if (!rReceipt.success) throw new Error('Repay reverted');

      return true;
    } catch (err) {
      console.error('[UNWIND] Step error:', err instanceof Error ? err.message : err);
      return false;
    }
  }

  private async finalCleanup(privyId: string, smartAccountAddr: string, position: MorphoPosition): Promise<void> {
    if (position.collateral <= 0n) return;
    const calls = [
      ...borrowExecutor.buildWithdrawCollateralCalls(position.collateral, smartAccountAddr, smartAccountAddr),
      { to: config.wstrc, data: this.wstrcIface.encodeFunctionData('unwrap', [position.collateral]) },
    ];
    await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, calls));
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
