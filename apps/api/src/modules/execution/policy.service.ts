import { MAX_LEVERAGE, MIN_LEVERAGE, MAX_SLIPPAGE_BPS } from '@xstocks/shared';
import { query } from '../../db/pool';

export class PolicyService {
  /**
   * Validate loop parameters before starting.
   * Throws on violation.
   */
  async validateLoop(params: {
    privyId: string;
    strcAmount: bigint;
    targetLeverage: number;
    maxSlippageBps: number;
  }): Promise<void> {
    if (params.strcAmount <= 0n) {
      throw new PolicyViolation('STRC amount must be greater than 0');
    }
    if (params.targetLeverage < MIN_LEVERAGE || params.targetLeverage > MAX_LEVERAGE) {
      throw new PolicyViolation(`Leverage must be between ${MIN_LEVERAGE}x and ${MAX_LEVERAGE}x`);
    }
    if (params.maxSlippageBps < 1 || params.maxSlippageBps > MAX_SLIPPAGE_BPS) {
      throw new PolicyViolation(`Slippage must be between 1 and ${MAX_SLIPPAGE_BPS} bps`);
    }

    // Check no concurrent active loop
    const { rows } = await query(
      `SELECT id FROM loop_executions WHERE privy_id = $1 AND status IN ('PENDING', 'IN_PROGRESS')`,
      [params.privyId],
    );
    if (rows.length > 0) {
      throw new PolicyViolation('An active loop already exists. Wait for it to complete or cancel it.');
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
