import { MAX_LEVERAGE, LEVERAGE_OPTIONS, UNWIND_TARGETS, MIN_DEPOSIT_USDC } from '@xstocks/shared';
import { ethers } from 'ethers';
import { config } from '../../config';
import { query } from '../../db/pool';
import { smartAccountService } from './smart-account.service';

const ERC20_BALANCE_ABI = ['function balanceOf(address) view returns (uint256)'];

export class PolicyService {
  /**
   * Validate loop parameters before starting.
   */
  async validateLoop(params: {
    privyId: string;
    usdcAmount: bigint;
    targetLeverage: number;
  }): Promise<void> {
    if (params.usdcAmount <= 0n) {
      throw new PolicyViolation('USDC amount must be greater than 0');
    }
    if (params.usdcAmount > BigInt(config.maxSingleLoopUsdc)) {
      const maxFormatted = (Number(config.maxSingleLoopUsdc) / 1e6).toFixed(0);
      throw new PolicyViolation(`Amount exceeds maximum of $${maxFormatted}`);
    }
    if (!(LEVERAGE_OPTIONS as readonly number[]).includes(params.targetLeverage)) {
      throw new PolicyViolation(`Leverage must be one of: ${LEVERAGE_OPTIONS.join(', ')}x`);
    }
    if (params.targetLeverage > MAX_LEVERAGE) {
      throw new PolicyViolation(`Leverage cannot exceed ${MAX_LEVERAGE}x`);
    }

    // Check minimum deposit for CoW swap minimums
    const minDeposit = MIN_DEPOSIT_USDC[params.targetLeverage];
    if (minDeposit && params.usdcAmount < minDeposit) {
      const minFormatted = (Number(minDeposit) / 1e6).toFixed(0);
      throw new PolicyViolation(`Minimum deposit for ${params.targetLeverage}x leverage is $${minFormatted} (CoW Protocol requires $10 minimum per swap)`);
    }

    // Check USDC balance in smart account
    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(params.privyId);
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const usdc = new ethers.Contract(config.usdc, ERC20_BALANCE_ABI, provider);
    const balance: bigint = await usdc.balanceOf(smartAccountAddr);

    if (balance < params.usdcAmount) {
      const balFormatted = (Number(balance) / 1e6).toFixed(2);
      const reqFormatted = (Number(params.usdcAmount) / 1e6).toFixed(2);
      throw new PolicyViolation(`Insufficient USDC balance. You have $${balFormatted} but need $${reqFormatted}. Deposit USDC to your wallet first.`);
    }

    // Check no concurrent active execution (FOR UPDATE prevents race condition)
    const { rows } = await query(
      `SELECT id FROM loop_executions WHERE privy_id = $1 AND status IN ('PENDING', 'IN_PROGRESS') FOR UPDATE`,
      [params.privyId],
    );
    if (rows.length > 0) {
      throw new PolicyViolation('An active loop already exists. Wait for it to complete or cancel it.');
    }

    // Check no active unwind
    const { rows: unwinds } = await query(
      `SELECT id FROM unwind_executions WHERE privy_id = $1 AND status IN ('PENDING', 'IN_PROGRESS') FOR UPDATE`,
      [params.privyId],
    );
    if (unwinds.length > 0) {
      throw new PolicyViolation('An unwind is in progress. Wait for it to complete.');
    }
  }

  /**
   * Validate unwind parameters.
   */
  async validateUnwind(params: {
    privyId: string;
    targetLeverage: number;
  }): Promise<void> {
    if (!(UNWIND_TARGETS as readonly number[]).includes(params.targetLeverage)) {
      throw new PolicyViolation(`Unwind target must be one of: ${UNWIND_TARGETS.join(', ')}`);
    }

    // Check no concurrent active execution (FOR UPDATE prevents race condition)
    const { rows: loops } = await query(
      `SELECT id FROM loop_executions WHERE privy_id = $1 AND status IN ('PENDING', 'IN_PROGRESS') FOR UPDATE`,
      [params.privyId],
    );
    if (loops.length > 0) {
      throw new PolicyViolation('A loop is in progress. Wait for it to complete.');
    }

    const { rows: unwinds } = await query(
      `SELECT id FROM unwind_executions WHERE privy_id = $1 AND status IN ('PENDING', 'IN_PROGRESS') FOR UPDATE`,
      [params.privyId],
    );
    if (unwinds.length > 0) {
      throw new PolicyViolation('An unwind is already in progress.');
    }
  }

  /**
   * Validate grid strategy parameters.
   */
  validateGridStrategy(params: { gridBuyPct: number }): void {
    if (params.gridBuyPct < 1 || params.gridBuyPct > 100) {
      throw new PolicyViolation('Grid buy percentage must be between 1 and 100');
    }
  }
}

export class PolicyViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyViolation';
  }
}

export const policyService = new PolicyService();
