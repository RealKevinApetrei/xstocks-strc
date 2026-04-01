'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { cn, formatUsd } from '@/lib/utils';
import { useStrcxPrice } from '@/hooks/use-strcx-price';
import { usePosition } from '@/hooks/use-position';
import { api } from '@/lib/api';

const TYDRO_APY = 5.2;

// Derive from hooks
function useVaultData() {
  const { data: position } = usePosition();
  const vb = position?.vaultBalance;
  return {
    balance: vb ? parseFloat(vb.assets) / 1e6 : 0,
    yield: 0, // TODO: track deposits to calculate yield
  };
}

export function BuyTheDipVault() {
  const { getAccessToken } = usePrivy();
  const { price: strcPrice } = useStrcxPrice();
  const vaultData = useVaultData();
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [gridBuyPct, setGridBuyPct] = useState(25);
  const [strategyEnabled, setStrategyEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const VAULT_BALANCE_USDC = vaultData.balance;
  const VAULT_YIELD_USDC = vaultData.yield;
  const STRC_PRICE_USD = strcPrice;

  const handleDeposit = async () => {
    if (!depositAmount || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      await api.depositToVault(token, depositAmount);
      setDepositAmount('');
    } catch (err) {
      console.error('Deposit failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      await api.withdrawFromVault(token, withdrawAmount);
      setWithdrawAmount('');
    } catch (err) {
      console.error('Withdraw failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Vault Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <span className="text-lg">$</span>
            </div>
            <div>
              <h2 className="text-base font-semibold">Buy the Dip Vault</h2>
              <p className="text-xs text-muted-foreground">USDC vault earning yield via Tydro, auto-deploys on STRC dips</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Tydro Base APY</div>
            <div className="text-sm font-mono font-semibold text-success">+{TYDRO_APY}%</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
        {/* Left: Vault Balance + Deposit/Withdraw */}
        <div className="p-6 space-y-5">
          {/* Balance */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Vault Balance</div>
              <div className="text-xl font-mono font-semibold">{formatUsd(VAULT_BALANCE_USDC)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Yield Earned</div>
              <div className="text-xl font-mono font-semibold text-success">+{formatUsd(VAULT_YIELD_USDC)}</div>
            </div>
          </div>

          {/* Deposit / Withdraw tabs */}
          <div className="flex border-b border-border">
            {(['deposit', 'withdraw'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'flex-1 pb-2 text-xs font-medium transition-colors border-b-2',
                  activeTab === tab
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div className="relative">
              <input
                type="text"
                value={activeTab === 'deposit' ? depositAmount : withdrawAmount}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  activeTab === 'deposit' ? setDepositAmount(val) : setWithdrawAmount(val);
                }}
                placeholder="0.0"
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 font-mono text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">USDC</span>
            </div>
            <button
              onClick={activeTab === 'deposit' ? handleDeposit : handleWithdraw}
              disabled={isSubmitting}
              className={cn(
                'w-full rounded-md py-2.5 text-sm font-medium transition-colors disabled:opacity-50',
                activeTab === 'deposit'
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              )}
            >
              {isSubmitting ? 'Processing...' : activeTab === 'deposit' ? 'Deposit to Vault' : 'Withdraw from Vault'}
            </button>
          </div>
        </div>

        {/* Right: Buy-the-Dip Strategy Config */}
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Buy-the-Dip Strategy</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Automated dip buying strategy</p>
            </div>
            <button
              onClick={() => setStrategyEnabled(!strategyEnabled)}
              className={cn(
                'relative h-5 w-9 rounded-full transition-colors',
                strategyEnabled ? 'bg-primary' : 'bg-muted',
              )}
            >
              <span className={cn(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                strategyEnabled ? 'left-[18px]' : 'left-0.5',
              )} />
            </button>
          </div>

          {/* Trigger condition */}
          <div className="rounded-md border border-border bg-background p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Trigger when Health Factor</span>
              <span className="text-sm font-mono font-semibold">&lt; 1.5</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              When your position health factor drops below this level, vault USDC is deployed to buy STRC and strengthen your position.
            </p>
          </div>

          {/* Grid buy percentage */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Deploy per trigger</label>
              <span className="text-sm font-mono font-semibold text-primary">{gridBuyPct}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="100"
              step="5"
              value={gridBuyPct}
              onChange={(e) => setGridBuyPct(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between">
              {[10, 25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setGridBuyPct(pct)}
                  className={cn(
                    'text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors',
                    gridBuyPct === pct ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-border bg-background p-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Would deploy</span>
              <span className="font-mono">{formatUsd(VAULT_BALANCE_USDC * gridBuyPct / 100)} per trigger</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Buys ~</span>
              <span className="font-mono">{STRC_PRICE_USD > 0 ? ((VAULT_BALANCE_USDC * gridBuyPct / 100) / STRC_PRICE_USD).toFixed(2) : '—'} STRC at current price</span>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 text-xs">
            <span className={cn('h-2 w-2 rounded-full', strategyEnabled ? 'bg-success animate-pulse' : 'bg-muted-foreground')} />
            <span className="text-muted-foreground">
              {strategyEnabled ? 'Monitoring STRC/USD price' : 'Strategy paused'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
