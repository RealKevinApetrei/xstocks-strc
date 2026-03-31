import { query } from '../../../db/pool';
import { config } from '../../../config';
import { borrowExecutor } from './borrow.executor';
import { smartAccountService } from '../smart-account.service';
import { cowSwapService } from '../../cowswap/cowswap.service';
import { signerService } from '../signer.service';
import { approvalExecutor } from './approval.executor';
import { ethers } from 'ethers';
import wSTRCABI from '@xstocks/shared/abis/wSTRC.json';

export class UnwindExecutor {
  /**
   * Unwind a leveraged position — multi-step (no flash loans due to xStocks RFQ).
   * Reverse loop: swap STRC→USDC → repay → withdraw wSTRC → unwrap → repeat until debt=0
   */
  async startUnwind(params: {
    privyId: string;
    loopExecutionId: string;
  }): Promise<string> {
    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(params.privyId);

    // Get current position
    const position = await borrowExecutor.getPosition(smartAccountAddr);
    if (position.borrowed === 0n) {
      throw new Error('No debt to repay — position already unwound');
    }

    // Create execution request
    const { rows: [execReq] } = await query(
      `INSERT INTO execution_requests (privy_id, type, status, smart_account_address)
       VALUES ($1, 'UNWIND', 'PENDING', $2) RETURNING id`,
      [params.privyId, smartAccountAddr],
    );

    // Create unwind record
    const { rows: [unwind] } = await query(
      `INSERT INTO unwind_executions
       (execution_request_id, loop_execution_id, privy_id, initial_debt_usdc, initial_collateral_wstrc, remaining_debt_usdc, remaining_collateral_wstrc, status)
       VALUES ($1, $2, $3, $4, $5, $4, $5, 'PENDING') RETURNING id`,
      [execReq.id, params.loopExecutionId, params.privyId, position.borrowed.toString(), position.collateral.toString()],
    );

    // Run unwind in background
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

      if (position.borrowed === 0n) {
        // All debt repaid — withdraw remaining collateral and unwrap
        if (position.collateral > 0n) {
          const wstrcIface = new ethers.Interface(wSTRCABI);
          const calls = [
            ...borrowExecutor.buildWithdrawCollateralCalls(position.collateral, smartAccountAddr, smartAccountAddr),
            { to: config.wstrc, data: wstrcIface.encodeFunctionData('unwrap', [position.collateral]) },
          ];
          await smartAccountService.sendBatchUserOp(privyId, calls);
        }

        await query(
          `UPDATE unwind_executions SET status = 'COMPLETED', remaining_debt_usdc = 0, remaining_collateral_wstrc = 0, current_step = $2 WHERE id = $1`,
          [unwindId, step],
        );
        return;
      }

      // Step 1: Withdraw some wSTRC collateral → unwrap → swap STRC for USDC
      // Step 2: Repay USDC debt
      // Repeat until debt = 0

      // TODO: Calculate safe amount to withdraw without liquidation
      // TODO: Execute swap via CoW, wait for fill, then repay

      await query(
        `UPDATE unwind_executions SET current_step = $2, remaining_debt_usdc = $3, remaining_collateral_wstrc = $4 WHERE id = $1`,
        [unwindId, step, position.borrowed.toString(), position.collateral.toString()],
      );

      // Safety: max 20 steps to prevent infinite loop
      if (step > 20) {
        await query(`UPDATE unwind_executions SET status = 'FAILED', error = 'Max unwind steps exceeded' WHERE id = $1`, [unwindId]);
        return;
      }
    }
  }
}

export const unwindExecutor = new UnwindExecutor();
