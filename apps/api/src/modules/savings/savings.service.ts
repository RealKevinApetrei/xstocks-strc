import { executeBasketSplit, executeWithdrawal } from './basket.executor';
import { smartAccountService } from '../execution/smart-account.service';

const MIN_DEPOSIT_USDC  = 20; // $10 minimum per token at 50/50
const MIN_WITHDRAW_USDC = 20;

function isMarketClosed(): boolean {
  const now  = new Date();
  const day  = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 0 || day === 6) return true;
  if (day === 5 && hour >= 20) return true;
  return false;
}

export class SavingsService {

  async deposit(params: {
    privyId: string;
    usdcAmount: number;
  }): Promise<{ depositId: string; queued: boolean }> {
    if (params.usdcAmount < MIN_DEPOSIT_USDC) {
      throw new Error(`Minimum deposit is $${MIN_DEPOSIT_USDC} ($${MIN_DEPOSIT_USDC / 2} per asset)`);
    }

    const smartAccountAddress = await smartAccountService.getSmartAccountAddress(params.privyId);
    const queued = isMarketClosed();

    if (!queued) {
      executeBasketSplit({
        privyId: params.privyId,
        smartAccountAddress,
        usdcAmount: params.usdcAmount,
      }).catch(err => console.error('[Savings] Basket split failed:', err));
    }

    return { depositId: `dep-${Date.now()}`, queued };
  }

  async withdraw(params: {
    privyId: string;
  }): Promise<{ withdrawalId: string }> {
    const smartAccountAddress = await smartAccountService.getSmartAccountAddress(params.privyId);

    executeWithdrawal({
      privyId: params.privyId,
      smartAccountAddress,
    }).catch(err => console.error('[Savings] Withdrawal failed:', err));

    return { withdrawalId: `wdl-${Date.now()}` };
  }

  async getPortfolio(_privyId: string): Promise<Record<string, unknown>> {
    return {
      plan: { strcPct: 50, tbillPct: 50, totalDepositedUsdc: 0 },
      portfolio: {
        portfolioValueUsd: 0,
        totalDepositedUsd: 0,
        yieldToDateUsd: 0,
        rewardsAvailableUsd: 0,
      },
      recentDeposits: [],
    };
  }

  async redeem(params: {
    privyId: string;
    productId: string;
    valueUsd: number;
  }): Promise<{ redemptionCode: string; orderId: string }> {
    const { bitrefillService } = await import('./bitrefill.service');
    return bitrefillService.placeOrder(params.productId, params.valueUsd);
  }
}

export const savingsService = new SavingsService();
