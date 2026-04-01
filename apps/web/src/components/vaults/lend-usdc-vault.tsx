'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { cn, formatUsd } from '@/lib/utils';
import { useSmartWallet } from '@/hooks/use-smart-wallet';
import { api } from '@/lib/api';

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

  return {
    assets: balance ? parseFloat(balance.assets) / 1e6 : 0,
    hasPosition: balance ? BigInt(balance.supplyShares || '0') > 0n : false,
  };
}

function useLendApy() {
  const [data, setData] = useState<LendApy | null>(null);
  useEffect(() => {
    let active = true;
    const fetch = async () => {
      try {
        const d = await api.getLendApy();
        if (active) setData(d);
      } catch {}
    };
    fetch();
    const iv = setInterval(fetch, 60_000);
    return () => { active = false; clearInterval(iv); };
  }, []);
  return data;
}

export function LendUsdcVault() {
  const { getAccessToken } = usePrivy();
  const lendData = useLendData();
  const apyData = useLendApy();

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const LEND_BALANCE = lendData.assets;
  const SUPPLY_APY = apyData?.supplyApy;
  const UTILIZATION = apyData?.utilization ?? 0;
  const TOTAL_SUPPLY = apyData ? parseFloat(apyData.totalSupply) / 1e6 : 0;
  const TOTAL_BORROW = apyData ? parseFloat(apyData.totalBorrow) / 1e6 : 0;

  const toUsdc6 = (usd: string) => BigInt(Math.round(parseFloat(usd) * 1e6)).toString();

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      await api.depositToLend(token, toUsdc6(depositAmount));
      setDepositAmount('');
    } catch (err) {
      console.error('Lend deposit failed:', err);
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
      const amount = withdrawAmount === 'max' ? 'max' : toUsdc6(withdrawAmount);
      await api.withdrawFromLend(token, amount);
      setWithdrawAmount('');
    } catch (err) {
      console.error('Lend withdraw failed:', err);
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
              <span className="text-lg font-semibold">$</span>
            </div>
            <div>
              <h2 className="text-base font-semibold">Lend USDC</h2>
              <p className="text-xs text-muted-foreground">Earn yield by supplying USDC to borrowers on Morpho</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Supply APY</div>
            <div className="text-sm font-mono font-semibold text-success">
              {SUPPLY_APY !== null && SUPPLY_APY !== undefined ? `+${SUPPLY_APY.toFixed(2)}%` : '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
        {/* Left: Balance + Deposit/Withdraw */}
        <div className="p-6 space-y-5">
          {/* Balance */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">Your Lending Balance</div>
            <div className="text-xl font-mono font-semibold">{formatUsd(LEND_BALANCE)}</div>
            {LEND_BALANCE > 0 && SUPPLY_APY !== null && SUPPLY_APY !== undefined && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Earning ~{formatUsd(LEND_BALANCE * SUPPLY_APY / 100)}/yr at current rate
              </div>
            )}
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
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {activeTab === 'withdraw' && LEND_BALANCE > 0 && (
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
              {isSubmitting ? 'Processing...' : activeTab === 'deposit' ? 'Supply USDC' : 'Withdraw USDC'}
            </button>
          </div>
        </div>

        {/* Right: Market Stats */}
        <div className="p-6 space-y-5">
          <div>
            <h3 className="text-sm font-medium">Market Overview</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">USDC/wSTRC market on Morpho</p>
          </div>

          <div className="space-y-3">
            <div className="rounded-md border border-border bg-background p-3 space-y-2.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Supply APY</span>
                <span className="font-mono font-semibold text-success">
                  {SUPPLY_APY !== null && SUPPLY_APY !== undefined ? `+${SUPPLY_APY.toFixed(2)}%` : '—'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Borrow APY</span>
                <span className="font-mono">
                  {apyData?.borrowApy !== null && apyData?.borrowApy !== undefined ? `${apyData.borrowApy.toFixed(2)}%` : '—'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Utilization</span>
                <span className="font-mono">{UTILIZATION.toFixed(1)}%</span>
              </div>
            </div>

            <div className="rounded-md border border-border bg-background p-3 space-y-2.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total Supplied</span>
                <span className="font-mono">{formatUsd(TOTAL_SUPPLY)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total Borrowed</span>
                <span className="font-mono">{formatUsd(TOTAL_BORROW)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Available Liquidity</span>
                <span className="font-mono">{formatUsd(TOTAL_SUPPLY - TOTAL_BORROW)}</span>
              </div>
            </div>

            {/* Utilization bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Utilization</span>
                <span className="font-mono">{UTILIZATION.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min(UTILIZATION, 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-[10px] text-muted-foreground">
              Your supplied USDC earns interest from borrowers who use leveraged looping on STRC.
              Yield is calculated from the Morpho IRM based on market utilization.
              Withdraw anytime — subject to available liquidity.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
