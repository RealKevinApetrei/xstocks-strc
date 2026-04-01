'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { cn, formatUsd } from '@/lib/utils';
import { useStrcxPrice } from '@/hooks/use-strcx-price';
import { usePosition } from '@/hooks/use-position';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { api, ApiError } from '@/lib/api';

const DCA_TRADE_OPTIONS = [2, 4, 6, 10] as const;
const DCA_INTERVAL_OPTIONS = [6, 12, 24] as const;

function useVaultData() {
  const { data: position } = usePosition();
  const vb = position?.vaultBalance;
  return {
    balance: vb ? parseFloat(vb.assets) / 1e6 : 0,
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

function StatusBanner({ error, success, onDismiss }: { error: string | null; success: string | null; onDismiss: () => void }) {
  if (!error && !success) return null;
  return (
    <div className={cn(
      'rounded-md border p-2.5 text-xs flex items-center justify-between',
      error ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-success/30 bg-success/5 text-success',
    )}>
      <span>{error || success}</span>
      <button onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100">&times;</button>
    </div>
  );
}

export function OrangeDotVault() {
  const { getAccessToken } = usePrivy();
  const { price: strcPrice } = useStrcxPrice();
  const vaultData = useVaultData();
  const tydroApy = useTydroApy();
  const { balance: walletUsdc } = useUsdcBalance();

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [numTrades, setNumTrades] = useState<number>(4);
  const [intervalHours, setIntervalHours] = useState<number>(12);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasStrategy, setHasStrategy] = useState(false);
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const VAULT_BALANCE = vaultData.balance;
  const dcaState = vaultData.gridStrategy;
  const clearStatus = () => { setError(null); setSuccess(null); };
  const toUsdc6 = (usd: string) => BigInt(Math.round(parseFloat(usd) * 1e6)).toString();
  const depositNum = parseFloat(depositAmount) || 0;
  const withdrawNum = parseFloat(withdrawAmount) || 0;
  const perTradeUsdc = VAULT_BALANCE / numTrades;
  const belowMinimum = VAULT_BALANCE > 0 && perTradeUsdc < 10;

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
      } catch {}
    })();
  }, [getAccessToken]);

  // Auto-save strategy when DCA config changes (if strategy exists)
  const saveStrategy = useCallback(async (trades: number, interval: number) => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      if (hasStrategy && strategyId) {
        await api.updateGridStrategy(token, strategyId, { numTrades: trades, tradeIntervalHours: interval });
      } else {
        const strategy = await api.createGridStrategy(token, { numTrades: trades, tradeIntervalHours: interval });
        setHasStrategy(true);
        setStrategyId(strategy.id);
      }
    } catch {}
  }, [getAccessToken, hasStrategy, strategyId]);

  const handleDeposit = async () => {
    clearStatus();
    if (!depositAmount || depositNum <= 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      await api.depositToVault(token, toUsdc6(depositAmount));
      setSuccess(`Deposited ${formatUsd(depositNum)}`);
      setDepositAmount('');
      // Auto-create strategy if first deposit
      if (!hasStrategy) await saveStrategy(numTrades, intervalHours);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Deposit failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    clearStatus();
    if (!withdrawAmount || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const isMax = parseFloat(withdrawAmount) >= Math.floor(VAULT_BALANCE * 100) / 100;
      await api.withdrawFromVault(token, isMax ? 'max' : toUsdc6(withdrawAmount));
      setSuccess(isMax ? 'Withdrew full balance' : `Withdrew ${formatUsd(withdrawNum)}`);
      setWithdrawAmount('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Withdraw failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <span className="h-3.5 w-3.5 rounded-full bg-orange-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Orange Dot Vault</h2>
              <p className="text-[10px] text-muted-foreground">Auto-buys STRC when price dips below $95</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground">Tydro APY</div>
            <div className="text-sm font-mono font-semibold text-success">
              {tydroApy !== null ? `+${tydroApy.toFixed(1)}%` : '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <StatusBanner error={error} success={success} onDismiss={clearStatus} />

        {/* Vault Balance */}
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">Vault Balance</div>
          <div className="text-xl font-mono font-semibold">{formatUsd(VAULT_BALANCE)}</div>
        </div>

        {/* DCA Progress */}
        {dcaState?.dcaActive && (
          <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-orange-400 font-medium">DCA Active</span>
              <span className="font-mono">{dcaState.tradesExecuted}/{dcaState.numTrades}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1">
              <div className="bg-orange-500 h-1 rounded-full transition-all"
                style={{ width: `${((dcaState.tradesExecuted ?? 0) / (dcaState.numTrades ?? 1)) * 100}%` }} />
            </div>
          </div>
        )}

        {/* DCA Config — locked when vault has funds */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground">Number of trades</label>
            <div className="flex gap-1.5">
              {DCA_TRADE_OPTIONS.map((n) => (
                <button key={n}
                  onClick={() => { if (VAULT_BALANCE > 0) return; setNumTrades(n); saveStrategy(n, intervalHours); }}
                  disabled={VAULT_BALANCE > 0}
                  className={cn(
                    'flex-1 py-1 text-xs font-mono rounded border transition-colors',
                    numTrades === n ? 'border-orange-500 bg-orange-500/10 text-orange-400' : 'border-border text-muted-foreground hover:text-foreground',
                    VAULT_BALANCE > 0 && numTrades !== n && 'opacity-30 cursor-not-allowed',
                  )}>{n}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground">Interval between trades</label>
            <div className="flex gap-1.5">
              {DCA_INTERVAL_OPTIONS.map((h) => (
                <button key={h}
                  onClick={() => { if (VAULT_BALANCE > 0) return; setIntervalHours(h); saveStrategy(numTrades, h); }}
                  disabled={VAULT_BALANCE > 0}
                  className={cn(
                    'flex-1 py-1 text-xs font-mono rounded border transition-colors',
                    intervalHours === h ? 'border-orange-500 bg-orange-500/10 text-orange-400' : 'border-border text-muted-foreground hover:text-foreground',
                    VAULT_BALANCE > 0 && intervalHours !== h && 'opacity-30 cursor-not-allowed',
                  )}>{h}h</button>
              ))}
            </div>
          </div>
          {VAULT_BALANCE > 0 && (
            <p className="text-[10px] text-muted-foreground">Withdraw all funds to change strategy settings.</p>
          )}

          {belowMinimum && (
            <p className="text-[10px] text-destructive">Min $10/trade. Deposit at least {formatUsd(10 * numTrades)} or reduce trades.</p>
          )}
        </div>

        {/* Deposit / Withdraw */}
        <div className="flex border-b border-border">
          {(['deposit', 'withdraw'] as const).map((tab) => (
            <button key={tab} onClick={() => { setActiveTab(tab); clearStatus(); }}
              className={cn('flex-1 pb-1.5 text-xs font-medium border-b-2 transition-colors',
                activeTab === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{activeTab === 'deposit' ? 'Wallet' : 'Vault'}</span>
            <span className="font-mono">{formatUsd(activeTab === 'deposit' ? walletUsdc : VAULT_BALANCE)}</span>
          </div>
          <div className="relative">
            <input type="text"
              value={activeTab === 'deposit' ? depositAmount : withdrawAmount}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); activeTab === 'deposit' ? setDepositAmount(v) : setWithdrawAmount(v); clearStatus(); }}
              placeholder="0.0"
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {activeTab === 'deposit' && walletUsdc > 0 && (
                <button onClick={() => setDepositAmount((Math.floor(walletUsdc * 100) / 100).toFixed(2))} className="text-[10px] font-medium text-primary hover:text-primary/80">MAX</button>
              )}
              {activeTab === 'withdraw' && VAULT_BALANCE > 0 && (
                <button onClick={() => setWithdrawAmount((Math.floor(VAULT_BALANCE * 100) / 100).toFixed(2))} className="text-[10px] font-medium text-primary hover:text-primary/80">MAX</button>
              )}
              <span className="text-[10px] text-muted-foreground">USDC</span>
            </div>
          </div>
          {activeTab === 'deposit' && depositNum > walletUsdc && walletUsdc > 0 && (
            <p className="text-[10px] text-destructive">Exceeds wallet balance</p>
          )}
          {activeTab === 'withdraw' && withdrawNum > VAULT_BALANCE && VAULT_BALANCE > 0 && (
            <p className="text-[10px] text-destructive">Exceeds vault balance</p>
          )}
          <button onClick={activeTab === 'deposit' ? handleDeposit : handleWithdraw}
            disabled={isSubmitting || (activeTab === 'deposit' && depositNum <= 0) || (activeTab === 'withdraw' && withdrawNum <= 0)}
            className={cn('w-full rounded-md py-2 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
              activeTab === 'deposit' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            )}>
            {isSubmitting ? 'Processing...' : activeTab === 'deposit'
              ? depositNum > 0 ? `Deposit ${formatUsd(depositNum)}` : 'Deposit'
              : withdrawNum > 0 ? `Withdraw ${formatUsd(withdrawNum)}` : 'Withdraw'}
          </button>
        </div>

        {/* Status line */}
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className={cn('h-1.5 w-1.5 rounded-full', dcaState?.dcaActive ? 'bg-orange-500 animate-pulse' : VAULT_BALANCE > 0 ? 'bg-orange-500' : 'bg-muted-foreground')} />
          <span className="text-muted-foreground">
            {dcaState?.dcaActive ? `DCA ${dcaState.tradesExecuted}/${dcaState.numTrades}` : VAULT_BALANCE > 0 ? 'Monitoring STRC price' : 'Configure strategy, then deposit to activate'}
          </span>
        </div>
      </div>
    </div>
  );
}
