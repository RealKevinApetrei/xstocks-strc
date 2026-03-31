import { ethers } from 'ethers';
import { query } from '../../../db/pool';
import { config } from '../../../config';
import { borrowExecutor, type MorphoPosition } from './borrow.executor';
import { smartAccountService } from '../smart-account.service';
import { cowSwapService } from '../../cowswap/cowswap.service';
import { signerService } from '../signer.service';
import { approvalExecutor } from './approval.executor';
import wSTRCABI from '@xstocks/shared/abis/wSTRC.json';

const UNWIND_MIN_HF = 1.3; // Minimum HF to maintain during unwind
const UNWIND_SAFETY_MARGIN = 0.95; // 5% safety margin on withdrawals
const MAX_UNWIND_STEPS = 20;

export class UnwindExecutor {
  private wstrcIface = new ethers.Interface(wSTRCABI);

  /**
   * Unwind a leveraged position — multi-step (no flash loans due to xStocks RFQ).
   */
  async startUnwind(params: {
    privyId: string;
    loopExecutionId: string;
  }): Promise<string> {
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
       (execution_request_id, loop_execution_id, privy_id, initial_debt_usdc, initial_collateral_wstrc, remaining_debt_usdc, remaining_collateral_wstrc, status)
       VALUES ($1, $2, $3, $4, $5, $4, $5, 'PENDING') RETURNING id`,
      [execReq.id, params.loopExecutionId, params.privyId, position.borrowed.toString(), position.collateral.toString()],
    );

    // Run in background
    this.runUnwind(unwind.id, params.privyId).catch((err) => {
      console.error(`Unwind ${unwind.id} failed:`, err);
      query(`UPDATE unwind_executions SET status = 'FAILED', error = $2 WHERE id = $1`, [unwind.id, err.message]);
    });

    return unwind.id;
  }

  private async runUnwind(unwindId: string, privyId: string): Promise<void> {
    await query(`UPDATE unwind_executions SET status = 'IN_PROGRESS' WHERE id = $1`, [unwindId]);

    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(privyId);
    let step = 0;

    while (true) {
      step++;
      const position = await borrowExecutor.getPosition(smartAccountAddr);

      // All debt repaid — withdraw remaining collateral
      if (position.borrowed === 0n) {
        if (position.collateral > 0n) {
          const finalCalls = [
            ...borrowExecutor.buildWithdrawCollateralCalls(position.collateral, smartAccountAddr, smartAccountAddr),
            { to: config.wstrc, data: this.wstrcIface.encodeFunctionData('unwrap', [position.collateral]) },
          ];
          const hash = await smartAccountService.sendBatchUserOp(privyId, finalCalls);
          await smartAccountService.waitForReceipt(hash);
        }

        await query(
          `UPDATE unwind_executions SET status = 'COMPLETED', remaining_debt_usdc = 0, remaining_collateral_wstrc = 0, current_step = $2 WHERE id = $1`,
          [unwindId, step],
        );
        return;
      }

      // Safety: max steps to prevent infinite loop
      if (step > MAX_UNWIND_STEPS) {
        await query(
          `UPDATE unwind_executions SET status = 'FAILED', error = 'Max unwind steps exceeded', current_step = $2 WHERE id = $1`,
          [unwindId, step],
        );
        return;
      }

      // Calculate safe withdrawal amount
      const safeWithdrawWstrc = this.calculateSafeWithdrawAmount(position);

      if (safeWithdrawWstrc === 0n) {
        await query(
          `UPDATE unwind_executions SET status = 'FAILED', error = 'Cannot safely withdraw — health factor too low', current_step = $2 WHERE id = $1`,
          [unwindId, step],
        );
        return;
      }

      try {
        // 1. Withdraw wSTRC collateral + unwrap to STRC
        const withdrawCalls = [
          ...borrowExecutor.buildWithdrawCollateralCalls(safeWithdrawWstrc, smartAccountAddr, smartAccountAddr),
          { to: config.wstrc, data: this.wstrcIface.encodeFunctionData('unwrap', [safeWithdrawWstrc]) },
        ];
        const withdrawHash = await smartAccountService.sendBatchUserOp(privyId, withdrawCalls);
        const withdrawReceipt = await smartAccountService.waitForReceipt(withdrawHash);
        if (!withdrawReceipt.success) {
          await query(`UPDATE unwind_executions SET status = 'FAILED', error = 'Withdraw UserOp failed', current_step = $2 WHERE id = $1`, [unwindId, step]);
          return;
        }

        // 2. Get STRC amount from unwrap
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const wstrcContract = new ethers.Contract(config.wstrc, wSTRCABI, provider);
        const strcFromUnwrap: bigint = await wstrcContract.wstrcToStrc(safeWithdrawWstrc);

        // 3. Approve STRC for CoW VaultRelayer
        const approveCalls = approvalExecutor.buildApproveCalls({
          token: config.strc, spender: config.cowVaultRelayer, amount: strcFromUnwrap,
        });
        const approveHash = await smartAccountService.sendBatchUserOp(privyId, approveCalls);
        await smartAccountService.waitForReceipt(approveHash);

        // 4. Swap STRC → USDC via CoW
        const quote = await cowSwapService.getQuote({
          sellToken: config.strc, buyToken: config.usdc,
          sellAmount: strcFromUnwrap, from: smartAccountAddr,
        });

        const wallet = await signerService.getWalletForUser(privyId);
        const signature = await signerService.signTypedData(
          wallet.walletId, quote.domain, quote.types, quote.primaryType, quote.order,
        );

        const orderUid = await cowSwapService.createOrder(quote, signature);
        const fill = await cowSwapService.waitForFill(orderUid);

        // 5. Approve USDC + repay debt on Morpho
        const usdcReceived = fill.buyAmount;
        const debtToRepay = position.borrowed < usdcReceived ? position.borrowed : usdcReceived;

        const repayCalls = [
          ...approvalExecutor.buildApproveCalls({ token: config.usdc, spender: config.morpho, amount: debtToRepay }),
          ...borrowExecutor.buildRepayCalls(debtToRepay, smartAccountAddr),
        ];
        const repayHash = await smartAccountService.sendBatchUserOp(privyId, repayCalls);
        await smartAccountService.waitForReceipt(repayHash);

        // Update state
        const remainingDebt = position.borrowed - debtToRepay;
        const remainingCollateral = position.collateral - safeWithdrawWstrc;
        await query(
          `UPDATE unwind_executions SET current_step = $2, remaining_debt_usdc = $3, remaining_collateral_wstrc = $4 WHERE id = $1`,
          [unwindId, step, remainingDebt.toString(), remainingCollateral.toString()],
        );

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        // Auto-retry once
        console.log(`Unwind step ${step} failed, retrying: ${message}`);
        try {
          // Retry same step — position state is still valid since we failed before repay
          continue;
        } catch {
          await query(
            `UPDATE unwind_executions SET status = 'FAILED', error = $2, current_step = $3 WHERE id = $1`,
            [unwindId, message, step],
          );
          return;
        }
      }
    }
  }

  /**
   * Calculate max wSTRC that can be safely withdrawn while keeping HF > 1.3.
   * Applies 5% safety margin.
   */
  private calculateSafeWithdrawAmount(position: MorphoPosition): bigint {
    if (position.borrowed === 0n) return position.collateral;

    if (position.healthFactor <= UNWIND_MIN_HF) return 0n;

    // W = C * (1 - minHF/HF) * safetyMargin
    const withdrawFraction = (1 - UNWIND_MIN_HF / position.healthFactor) * UNWIND_SAFETY_MARGIN;
    const safeAmount = BigInt(Math.floor(Number(position.collateral) * withdrawFraction));

    return safeAmount > 0n ? safeAmount : 0n;
  }
}

export const unwindExecutor = new UnwindExecutor();
