import { ethers } from 'ethers';
import { executeBasketSplit, executeWithdrawal } from './basket.executor';
import { smartAccountService } from '../execution/smart-account.service';
import { config } from '../../config';
import { getProvider, retryCall } from '../../lib/provider';
import { bitrefillService } from './bitrefill.service';

const MIN_DEPOSIT_USDC = 20; // $10 minimum per token at 50/50

const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

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

  async getPortfolio(privyId: string): Promise<Record<string, unknown>> {
    const smartAccountAddress = await smartAccountService.getSmartAccountAddress(privyId);
    const provider = getProvider();

    let strcBalance = 0n;
    let tbillBalance = 0n;

    try {
      const strc = new ethers.Contract(config.strc, ERC20_ABI, provider);
      strcBalance = await retryCall(() => strc.balanceOf(smartAccountAddress), 3, 'STRC balanceOf');
    } catch { /* ignore */ }

    if (config.tbillXstock) {
      try {
        const tbill = new ethers.Contract(config.tbillXstock, ERC20_ABI, provider);
        tbillBalance = await retryCall(() => tbill.balanceOf(smartAccountAddress), 3, 'T-Bill balanceOf');
      } catch { /* ignore */ }
    }

    return {
      plan: { strcPct: 50, tbillPct: 50 },
      portfolio: {
        strcBalance: strcBalance.toString(),
        tbillBalance: tbillBalance.toString(),
        strcFormatted: Number(strcBalance) / 1e18,
        tbillFormatted: Number(tbillBalance) / 1e18,
      },
      recentDeposits: [],
    };
  }

  async redeem(params: {
    privyId: string;
    productId: string;
    valueUsd: number;
  }): Promise<{ redemptionCode: string; orderId: string }> {
    return bitrefillService.placeOrder(params.productId, params.valueUsd);
  }
}

export const savingsService = new SavingsService();
