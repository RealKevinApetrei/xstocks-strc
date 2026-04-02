'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { cn, formatUsd } from '@/lib/utils';
import { useSmartWallet } from '@/hooks/use-smart-wallet';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { api, ApiError } from '@/lib/api';

interface LendApy {
  supplyApy: number | null;
  borrowApy: number | null;
  utilization: number;
  totalSupply: string;
  totalBorrow: string;
}

function useLendData() {
  const { getAccessToken } = usePrivy();
  const { address } = useSmartWallet();
  const [balance, setBalance] = useState<{ supplyShares: string; assets: string } | null>(null);
  useEffect(() => {
    if (!address) return;
    let active = true;
    const fetch = async () => {
      try {
        const token = await getAccessToken();
        if (!token || !active) return;
        const b = await api.getLendBalance(token, address);
        if (active) setBalance(b);
      } catch {}
    };
    fetch();
    const iv = setInterval(fetch, 10_000);
    return () => { active = false; clearInterval(iv); };
  }, [address, getAccessToken]);
  return { assets: balance ? parseFloat(balance.assets) / 1e6 : 0 };
}

function useLendApy() {
  const [data, setData] = useState<LendApy | null>(null);
  useEffect(() => {
    let active = true;
    const fetch = async () => { try { const d = await api.getLendApy(); if (active) setData(d); } catch {} };
    fetch();
    const iv = setInterval(fetch, 60_000);
    return () => { active = false; clearInterval(iv); };
  }, []);
  return data;
}

function formatApy(apy: number | null | undefined): string {
  if (apy === null || apy === undefined) return '—';
  if (apy < 0.01 && apy > 0) return `+${apy.toFixed(4)}%`;
  return `+${apy.toFixed(2)}%`;
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

export function LendUsdcVault() {
  const { getAccessToken } = usePrivy();
  const lendData = useLendData();
  const apyData = useLendApy();
  const { balance: walletUsdc } = useUsdcBalance();

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const LEND_BALANCE = lendData.assets;
  const SUPPLY_APY = apyData?.supplyApy;
  const UTILIZATION = apyData?.utilization ?? 0;
  const TOTAL_SUPPLY = apyData ? parseFloat(apyData.totalSupply) / 1e6 : 0;
  const TOTAL_BORROW = apyData ? parseFloat(apyData.totalBorrow) / 1e6 : 0;

  const clearStatus = () => { setError(null); setSuccess(null); };
  const toUsdc6 = (usd: string) => BigInt(Math.round(parseFloat(usd) * 1e6)).toString();
  const depositNum = parseFloat(depositAmount) || 0;
  const withdrawNum = parseFloat(withdrawAmount) || 0;

  const handleDeposit = async () => {
    clearStatus();
    if (!depositAmount || depositNum <= 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      await api.depositToLend(token, toUsdc6(depositAmount));
      setSuccess(`Supplied ${formatUsd(depositNum)}`);
      setDepositAmount('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Supply failed');
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
      const isMax = parseFloat(withdrawAmount) >= Math.floor(LEND_BALANCE * 100) / 100;
      await api.withdrawFromLend(token, isMax ? 'max' : toUsdc6(withdrawAmount));
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
            <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <span className="text-base font-semibold">$</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold">Lend USDC</h2>
              <p className="text-[10px] text-muted-foreground">Supply to Morpho borrowers</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground">Supply APY</div>
            <div className="text-sm font-mono font-semibold text-success">
              {formatApy(SUPPLY_APY)}
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <StatusBanner error={error} success={success} onDismiss={clearStatus} />

        {/* Balance */}
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">Lending Balance</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-mono font-semibold">{formatUsd(LEND_BALANCE)}</span>
            {LEND_BALANCE > 0 && SUPPLY_APY !== null && SUPPLY_APY !== undefined && (
              <span className={`text-[10px] font-mono ${SUPPLY_APY > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                {SUPPLY_APY > 0 ? `+${SUPPLY_APY < 0.01 ? SUPPLY_APY.toFixed(4) : SUPPLY_APY.toFixed(2)}% APY` : '0% APY'}
              </span>
            )}
          </div>
          {LEND_BALANCE > 0 && SUPPLY_APY !== null && SUPPLY_APY !== undefined && SUPPLY_APY > 0 && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              ~{formatUsd(LEND_BALANCE * SUPPLY_APY / 100)}/yr
            </div>
          )}
        </div>

        {/* Deposit / Withdraw */}
        <div className="flex border-b border-border">
          {(['deposit', 'withdraw'] as const).map((tab) => (
            <button key={tab} onClick={() => { setActiveTab(tab); clearStatus(); }}
              className={cn('flex-1 pb-1.5 text-xs font-medium border-b-2 transition-colors',
                activeTab === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}>{activeTab === 'deposit' && tab === 'deposit' ? 'Supply' : tab === 'deposit' ? 'Supply' : 'Withdraw'}</button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{activeTab === 'deposit' ? 'Wallet' : 'Lending'}</span>
            <span className="font-mono">{formatUsd(activeTab === 'deposit' ? walletUsdc : LEND_BALANCE)}</span>
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
              {activeTab === 'withdraw' && LEND_BALANCE > 0 && (
                <button onClick={() => setWithdrawAmount((Math.floor(LEND_BALANCE * 100) / 100).toFixed(2))} className="text-[10px] font-medium text-primary hover:text-primary/80">MAX</button>
              )}
              <span className="text-[10px] text-muted-foreground">USDC</span>
            </div>
          </div>
          {activeTab === 'deposit' && depositNum > walletUsdc && walletUsdc > 0 && (
            <p className="text-[10px] text-destructive">Exceeds wallet balance</p>
          )}
          {activeTab === 'withdraw' && withdrawNum > LEND_BALANCE && LEND_BALANCE > 0 && (
            <p className="text-[10px] text-destructive">Exceeds lending balance</p>
          )}
          <button onClick={activeTab === 'deposit' ? handleDeposit : handleWithdraw}
            disabled={isSubmitting || (activeTab === 'deposit' && depositNum <= 0) || (activeTab === 'withdraw' && withdrawNum <= 0)}
            className={cn('w-full rounded-md py-2 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
              activeTab === 'deposit' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            )}>
            {isSubmitting ? 'Processing...' : activeTab === 'deposit'
              ? depositNum > 0 ? `Supply ${formatUsd(depositNum)}` : 'Supply'
              : withdrawNum > 0 ? `Withdraw ${formatUsd(withdrawNum)}` : 'Withdraw'}
          </button>
        </div>

        {/* Market Overview */}
        <div className="pt-1">
          <span className="text-[10px] text-muted-foreground">Market Overview</span>
        </div>
        <div className="rounded-md border border-border bg-background p-3 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Supply APY</span>
            <span className="font-mono text-success">{formatApy(SUPPLY_APY)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Borrow APY</span>
            <span className="font-mono">{apyData?.borrowApy != null ? `${apyData.borrowApy.toFixed(2)}%` : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Utilization</span>
            <span className="font-mono">{UTILIZATION.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1">
            <div className="bg-primary h-1 rounded-full transition-all" style={{ width: `${Math.min(UTILIZATION, 100)}%` }} />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Supplied</span>
            <span className="font-mono">{formatUsd(TOTAL_SUPPLY)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Borrowed</span>
            <span className="font-mono">{formatUsd(TOTAL_BORROW)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Available</span>
            <span className="font-mono">{formatUsd(TOTAL_SUPPLY - TOTAL_BORROW)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
