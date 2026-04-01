'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { cn, formatUsd } from '@/lib/utils';
import { useStrcxPrice } from '@/hooks/use-strcx-price';
import { usePosition } from '@/hooks/use-position';
import { api } from '@/lib/api';

const DCA_TRADE_OPTIONS = [2, 4, 6, 10] as const;
const DCA_INTERVAL_OPTIONS = [6, 12, 24] as const;

function useVaultData() {
  const { data: position } = usePosition();
  const vb = position?.vaultBalance;
  return {
    balance: vb ? parseFloat(vb.assets) / 1e6 : 0,
    strcBalance: position?.strcBalance ? parseFloat(position.strcBalance) / 1e18 : 0,
    gridStrategy: position?.gridStrategy ?? null,
  };
}

function useTydroApy() {
  const [apy, setApy] = useState<number | null>(null);
  useEffect(() => {
    api.getAaveYield(7).then((d) => setApy(d.currentSupplyApy)).catch(() => {});
  }, []);
  return apy;
}

export function OrangeDotVault() {
  const { getAccessToken } = usePrivy();
  const { price: strcPrice } = useStrcxPrice();
  const vaultData = useVaultData();
  const tydroApy = useTydroApy();

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [numTrades, setNumTrades] = useState<number>(4);
  const [intervalHours, setIntervalHours] = useState<number>(12);
  const [strategyEnabled, setStrategyEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasStrategy, setHasStrategy] = useState(false);
  const [strategyId, setStrategyId] = useState<string | null>(null);

  const VAULT_BALANCE_USDC = vaultData.balance;
  const STRC_BALANCE = vaultData.strcBalance;
  const STRC_PRICE_USD = strcPrice;
  const dcaState = vaultData.gridStrategy;

  // Load existing strategy on mount
  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const strategy = await api.getMyGridStrategy(token);
        setHasStrategy(true);
        setStrategyId(strategy.id);
        setNumTrades(strategy.numTrades);
        setIntervalHours(strategy.tradeIntervalHours);
        setStrategyEnabled(strategy.enabled);
      } catch {
        // No strategy yet
      }
    })();
  }, [getAccessToken]);

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
      const amount = withdrawAmount === 'max' ? 'max' : withdrawAmount;
      await api.withdrawFromVault(token, amount);
      setWithdrawAmount('');
    } catch (err) {
      console.error('Withdraw failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveStrategy = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      if (hasStrategy && strategyId) {
        await api.updateGridStrategy(token, strategyId, {
          numTrades,
          tradeIntervalHours: intervalHours,
          enabled: strategyEnabled,
        });
      } else {
        const strategy = await api.createGridStrategy(token, {
          numTrades,
          tradeIntervalHours: intervalHours,
        });
        setHasStrategy(true);
        setStrategyId(strategy.id);
      }
    } catch (err) {
      console.error('Strategy save failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [getAccessToken, hasStrategy, strategyId, numTrades, intervalHours, strategyEnabled, isSubmitting]);

  const handleClaimStrc = async () => {
    if (STRC_BALANCE <= 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      await api.closeStrc(token);
    } catch (err) {
      console.error('Claim STRC failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const perTradeUsdc = VAULT_BALANCE_USDC / numTrades;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Vault Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <span className="h-4 w-4 rounded-full bg-orange-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Orange Dot Vault</h2>
              <p className="text-xs text-muted-foreground">USDC earning yield via Tydro, auto-buys STRC when price dips below $95</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Tydro Base APY</div>
            <div className="text-sm font-mono font-semibold text-success">
              {tydroApy !== null ? `+${tydroApy.toFixed(1)}%` : '—'}
            </div>
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
              <div className="text-xs text-muted-foreground mb-1">STRC Purchased</div>
              <div className="text-xl font-mono font-semibold text-orange-400">
                {STRC_BALANCE > 0 ? `${STRC_BALANCE.toFixed(2)} STRC` : '—'}
              </div>
            </div>
          </div>

          {/* Claim STRC button */}
          {STRC_BALANCE > 0 && (
            <button
              onClick={handleClaimStrc}
              disabled={isSubmitting}
              className="w-full rounded-md py-2 text-sm font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Claiming...' : `Claim ${STRC_BALANCE.toFixed(2)} STRC (~${formatUsd(STRC_BALANCE * STRC_PRICE_USD)})`}
            </button>
          )}

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
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {activeTab === 'withdraw' && VAULT_BALANCE_USDC > 0 && (
                  <button
                    onClick={() => setWithdrawAmount('max')}
                    className="text-[10px] font-medium text-primary hover:text-primary/80"
                  >
                    MAX
                  </button>
                )}
                <span className="text-xs text-muted-foreground">USDC</span>
              </div>
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

        {/* Right: DCA Strategy Config */}
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">DCA Strategy</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Auto-buy STRC when price dips</p>
            </div>
            <button
              onClick={() => setStrategyEnabled(!strategyEnabled)}
              className={cn(
                'relative h-5 w-9 rounded-full transition-colors',
                strategyEnabled ? 'bg-orange-500' : 'bg-muted',
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
              <span className="text-xs text-muted-foreground">Trigger when STRC price</span>
              <span className="text-sm font-mono font-semibold text-orange-400">&lt; $95</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              When STRC drops below $95, your vault USDC is used to DCA into STRC over multiple trades.
            </p>
          </div>

          {/* Number of trades */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Number of trades</label>
            <div className="flex gap-2">
              {DCA_TRADE_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setNumTrades(n)}
                  className={cn(
                    'flex-1 py-1.5 text-xs font-mono rounded-md border transition-colors',
                    numTrades === n
                      ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Interval */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Interval between trades</label>
            <div className="flex gap-2">
              {DCA_INTERVAL_OPTIONS.map((h) => (
                <button
                  key={h}
                  onClick={() => setIntervalHours(h)}
                  className={cn(
                    'flex-1 py-1.5 text-xs font-mono rounded-md border transition-colors',
                    intervalHours === h
                      ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-md border border-border bg-background p-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Per trade</span>
              <span className="font-mono">{formatUsd(perTradeUsdc)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Buys ~</span>
              <span className="font-mono">{STRC_PRICE_USD > 0 ? (perTradeUsdc / STRC_PRICE_USD).toFixed(2) : '—'} STRC per trade</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total duration</span>
              <span className="font-mono">{numTrades * intervalHours}h ({(numTrades * intervalHours / 24).toFixed(1)}d)</span>
            </div>
          </div>

          {/* DCA Progress (when active) */}
          {dcaState?.dcaActive && (
            <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-orange-400">DCA Active</span>
                <span className="text-xs font-mono">{dcaState.tradesExecuted}/{dcaState.numTrades} trades</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-orange-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${((dcaState.tradesExecuted ?? 0) / (dcaState.numTrades ?? 1)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Save / Status */}
          <button
            onClick={handleSaveStrategy}
            disabled={isSubmitting}
            className="w-full rounded-md py-2 text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : hasStrategy ? 'Update Strategy' : 'Enable Strategy'}
          </button>

          <div className="flex items-center gap-2 text-xs">
            <span className={cn('h-2 w-2 rounded-full', strategyEnabled ? 'bg-orange-500 animate-pulse' : 'bg-muted-foreground')} />
            <span className="text-muted-foreground">
              {dcaState?.dcaActive
                ? `DCA in progress — ${dcaState.tradesExecuted}/${dcaState.numTrades} trades done`
                : strategyEnabled
                  ? 'Monitoring STRC/USD price'
                  : 'Strategy paused'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
