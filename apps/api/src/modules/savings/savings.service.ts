import { query } from '../../db/pool';
import { executeBasketSplit, executeWithdrawal } from './basket.executor';
import { smartAccountService } from '../execution/smart-account.service';

const STRC_PCT = 50; // Fixed 50/50 basket
const MIN_DEPOSIT_USDC = 20; // $10 minimum per token at 50/50
const MIN_WITHDRAW_USDC = 20; // Same — CoW rejects orders < $10

/**
 * Market is closed Friday after 20:00 UTC (4PM ET) through end of Sunday.
 * Deposits during this window are queued for Monday open.
 */
function isMarketClosed(): boolean {
  const now = new Date();
  const day = now.getUTCDay();   // 0=Sun, 1=Mon … 5=Fri, 6=Sat
  const hour = now.getUTCHours();
  if (day === 0 || day === 6) return true;              // Full weekend
  if (day === 5 && hour >= 20) return true;             // Friday from 4PM ET
  return false;
}

export class SavingsService {

  /**
   * Record a USDC deposit and kick off basket execution (or queue for Monday).
   * Auto-creates a 50/50 savings plan for the user on first deposit.
   */
  async deposit(params: {
    privyId: string;
    usdcAmount: number;
  }): Promise<{ depositId: string; queued: boolean }> {
    if (params.usdcAmount < MIN_DEPOSIT_USDC) {
      throw new Error(`Minimum deposit is $${MIN_DEPOSIT_USDC} (${MIN_DEPOSIT_USDC / 2} per asset)`);
    }

    // Auto-resolve smart account address from Privy
    const smartAccountAddress = await smartAccountService.getSmartAccountAddress(params.privyId);

    // Auto-upsert plan at 50/50 — created on first deposit, updated if address changes
    await query(
      `INSERT INTO savings_plans (privy_id, smart_account_address, monthly_target_usdc, strc_pct)
       VALUES ($1, $2, 100, $3)
       ON CONFLICT (privy_id) DO UPDATE
         SET smart_account_address = EXCLUDED.smart_account_address,
             updated_at = NOW()`,
      [params.privyId, smartAccountAddress, STRC_PCT],
    );

    const strcAllocated  = params.usdcAmount * (STRC_PCT / 100);
    const tbillAllocated = params.usdcAmount - strcAllocated;
    const queued = isMarketClosed();

    const { rows: [deposit] } = await query(
      `INSERT INTO savings_deposits
         (privy_id, usdc_amount, strc_pct, strc_usdc_allocated, tbill_usdc_allocated,
          queued_for_monday, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        params.privyId,
        params.usdcAmount,
        STRC_PCT,
        strcAllocated,
        tbillAllocated,
        queued,
        queued ? 'QUEUED' : 'PENDING',
      ],
    );

    const depositId = deposit.id as string;

    if (!queued) {
      executeBasketSplit(depositId).catch(err =>
        console.error(`[Savings] Basket split failed for deposit ${depositId}:`, err),
      );
    }

    return { depositId, queued };
  }

  /**
   * Withdraw savings — sells all STRC and T-Bill back to USDC via CoW Protocol.
   */
  async withdraw(params: {
    privyId: string;
    usdcAmount: number;
  }): Promise<{ withdrawalId: string }> {
    if (params.usdcAmount < MIN_WITHDRAW_USDC) {
      throw new Error(`Minimum withdrawal is $${MIN_WITHDRAW_USDC} (${MIN_WITHDRAW_USDC / 2} per asset)`);
    }

    const { rows: [plan] } = await query(
      `SELECT smart_account_address FROM savings_plans WHERE privy_id = $1`,
      [params.privyId],
    );
    if (!plan) throw new Error('No savings plan found — make a deposit first');

    const { rows: [withdrawal] } = await query(
      `INSERT INTO savings_withdrawals (privy_id, usdc_amount, status)
       VALUES ($1, $2, 'PENDING') RETURNING id`,
      [params.privyId, params.usdcAmount],
    );

    const withdrawalId = withdrawal.id as string;

    executeWithdrawal({
      privyId: params.privyId,
      withdrawalId,
      usdcAmount: params.usdcAmount,
      smartAccountAddress: plan.smart_account_address,
    }).catch(err => console.error(`[Savings] Withdrawal ${withdrawalId} failed:`, err));

    return { withdrawalId };
  }

  /**
   * Get the savings portfolio for a user.
   */
  async getPortfolio(privyId: string): Promise<Record<string, unknown>> {
    const { rows: [plan] } = await query(
      `SELECT * FROM savings_plans WHERE privy_id = $1`,
      [privyId],
    );

    const { rows: deposits } = await query(
      `SELECT * FROM savings_deposits WHERE privy_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [privyId],
    );

    const { rows: [latestSnapshot] } = await query(
      `SELECT * FROM savings_yield_snapshots WHERE privy_id = $1 ORDER BY snapped_at DESC LIMIT 1`,
      [privyId],
    );

    const yieldToDate = Number(latestSnapshot?.yield_to_date_usd ?? 0);

    return {
      plan: plan
        ? {
            strcPct: STRC_PCT,
            tbillPct: 100 - STRC_PCT,
            totalDepositedUsdc: Number(plan.total_deposited_usdc),
          }
        : null,
      portfolio: {
        portfolioValueUsd: Number(latestSnapshot?.portfolio_value_usd ?? 0),
        totalDepositedUsd: Number(latestSnapshot?.total_deposited_usd ?? plan?.total_deposited_usdc ?? 0),
        yieldToDateUsd: yieldToDate,
        rewardsAvailableUsd: +yieldToDate.toFixed(2),
      },
      recentDeposits: deposits.map((d: any) => ({
        id: d.id,
        usdcAmount: Number(d.usdc_amount),
        strcAllocated: Number(d.strc_usdc_allocated),
        tbillAllocated: Number(d.tbill_usdc_allocated),
        queued: d.queued_for_monday,
        status: d.status,
        createdAt: d.created_at,
      })),
    };
  }

  /**
   * Redeem accumulated yield for a gift card (Bitrefill — mocked for now).
   */
  async redeem(params: {
    privyId: string;
    productId: string;
    valueUsd: number;
  }): Promise<{ redemptionCode: string; orderId: string }> {
    const { rows: [snapshot] } = await query(
      `SELECT yield_to_date_usd FROM savings_yield_snapshots
       WHERE privy_id = $1 ORDER BY snapped_at DESC LIMIT 1`,
      [params.privyId],
    );

    const available = Number(snapshot?.yield_to_date_usd ?? 0);
    if (params.valueUsd > available) {
      throw new Error(`Insufficient rewards: $${available.toFixed(2)} available`);
    }

    const { bitrefillService } = await import('./bitrefill.service');
    const order = await bitrefillService.placeOrder(params.productId, params.valueUsd);

    await query(
      `INSERT INTO savings_rewards
         (privy_id, yield_usd, reward_usd, bitrefill_product_id, bitrefill_product_name,
          redemption_status, bitrefill_order_id, redeemed_at)
       VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6, NOW())`,
      [params.privyId, params.valueUsd, params.valueUsd, params.productId, params.productId, order.orderId],
    );

    return { redemptionCode: order.redemptionCode, orderId: order.orderId };
  }
}

export const savingsService = new SavingsService();
