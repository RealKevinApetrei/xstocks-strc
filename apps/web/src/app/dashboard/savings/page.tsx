'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSmartWallet } from '@/hooks/use-smart-wallet';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { useTokenBalance } from '@/hooks/use-token-balance';
import { api, ApiError } from '@/lib/api';

const STRC_ADDRESS  = process.env.NEXT_PUBLIC_STRC_ADDRESS  || '';
const TBILL_ADDRESS = process.env.NEXT_PUBLIC_TBILL_ADDRESS || '';
const MIN_DEPOSIT   = 20;

// Friday after 20:00 UTC (4PM ET) through Sunday = market closed
function isMarketClosed(): boolean {
  const now  = new Date();
  const day  = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 0 || day === 6) return true;
  if (day === 5 && hour >= 20) return true;
  return false;
}

// Demo stats — hardcoded to showcase the product
const DEMO_BALANCE  = 1247.50;
const DEMO_YIELD    = 24.80;
const DEMO_REWARDS  = 24.80;

type Product = { id: string; name: string; category: string; minValue: number; logoUrl: string };

export default function SavingsPage() {
  const { ready } = useSmartWallet();
  const { balance: usdcBalance, refresh: refreshUsdc } = useUsdcBalance();
  const { balance: strcBalance, refresh: refreshStrc } = useTokenBalance(STRC_ADDRESS);
  const { balance: tbillBalance, refresh: refreshTbill } = useTokenBalance(TBILL_ADDRESS);

  function refreshAll() {
    refreshUsdc();
    refreshStrc();
    refreshTbill();
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-3 w-28 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  const hasHoldings = strcBalance > 0 || tbillBalance > 0;

  return (
    <div className="space-y-6">

      {/* ── Header stats ──────────────────────────────────────────── */}
      <div className="flex items-end gap-10">
        <div>
          <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-2">
            Savings Balance
          </p>
          <span className="text-5xl font-mono font-bold tracking-tight">
            ${DEMO_BALANCE.toFixed(2)}
          </span>
        </div>
        <div>
          <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-2">
            Yield Earned
          </p>
          <span className="text-5xl font-mono font-bold tracking-tight text-success">
            +${DEMO_YIELD.toFixed(2)}
          </span>
        </div>
        <div>
          <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-2">
            Rewards
          </p>
          <span className="text-5xl font-mono font-bold tracking-tight" style={{ color: '#c47a1a' }}>
            ${DEMO_REWARDS.toFixed(2)}
          </span>
        </div>
      </div>

      {/* ── Main grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left col */}
        <div className="lg:col-span-2 space-y-4">
          <DepositSection usdcBalance={usdcBalance} onDeposited={refreshAll} />
          {hasHoldings && (
            <HoldingsCard
              strcBalance={strcBalance}
              tbillBalance={tbillBalance}
              onWithdrawn={refreshAll}
            />
          )}
        </div>

        {/* Right col — rewards */}
        <RewardsPanel rewards={DEMO_REWARDS} onRedeemed={refreshAll} />
      </div>

    </div>
  );
}

// ─── Deposit Section ──────────────────────────────────────────────────────────

function DepositSection({
  usdcBalance,
  onDeposited,
}: {
  usdcBalance: number;
  onDeposited: () => void;
}) {
  const { getAccessToken } = usePrivy();
  const [amount, setAmount]         = useState('');
  const [depositing, setDepositing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);

  const num         = parseFloat(amount) || 0;
  const strc50      = num / 2;
  const tbill50     = num / 2;
  const marketClosed = isMarketClosed();
  const tooLow      = num > 0 && num < MIN_DEPOSIT;
  const tooHigh     = num > usdcBalance;
  const canDeposit  = num >= MIN_DEPOSIT && !tooHigh && !depositing && usdcBalance > 0;

  const quickAmounts = [20, 50, 100, 250, 500].filter(q => q <= usdcBalance + 0.01);

  async function deposit() {
    if (!canDeposit) return;
    setDepositing(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const result = await api.savingsDeposit(token, num);
      setSuccess(result.message);
      setAmount('');
      onDeposited();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setDepositing(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
          Deposit USDC
        </h2>
        <span className="text-xs font-mono text-muted-foreground">
          Balance:{' '}
          <span className="text-foreground font-medium">{usdcBalance.toFixed(2)} USDC</span>
        </span>
      </div>

      {/* Amount input */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
        <input
          type="number"
          min={MIN_DEPOSIT}
          step={10}
          placeholder="0.00"
          value={amount}
          onChange={e => { setAmount(e.target.value); setError(null); setSuccess(null); }}
          className="w-full rounded-md border border-border bg-background pl-7 pr-16 py-3 font-mono text-2xl font-semibold placeholder:text-muted-foreground/30 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">USDC</span>
      </div>

      {/* Quick amounts */}
      {quickAmounts.length > 0 && (
        <div className="flex gap-2">
          {quickAmounts.map(q => (
            <button
              key={q}
              onClick={() => setAmount(String(q))}
              className="flex-1 rounded-md border border-border py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
            >
              ${q}
            </button>
          ))}
          <button
            onClick={() => setAmount(Math.floor(usdcBalance).toString())}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
          >
            MAX
          </button>
        </div>
      )}

      {/* Allocation preview */}
      {num >= MIN_DEPOSIT && (
        <div className="rounded-md border border-border bg-background p-3 space-y-2">
          <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Allocation</p>
          <div className="flex justify-between text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
              STRC (50%)
            </span>
            <span className="font-mono font-medium">${strc50.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success/70 inline-block" />
              Invesco T-Bill (50%)
            </span>
            <span className="font-mono font-medium">${tbill50.toFixed(2)}</span>
          </div>
          <p className="text-[10px] text-muted-foreground pt-1.5 border-t border-border">
            Swapped via CoW Protocol on INK chain
          </p>
        </div>
      )}

      {/* Market closed notice */}
      {marketClosed && num >= MIN_DEPOSIT && (
        <div className="rounded-md border border-warning/25 bg-warning/5 p-3">
          <p className="text-xs font-medium text-warning">Markets closed</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your deposit will be queued and allocated Monday when markets open.
          </p>
        </div>
      )}

      {/* No USDC */}
      {usdcBalance === 0 && (
        <p className="text-xs text-muted-foreground">
          No USDC in your wallet.{' '}
          <button
            onClick={() => document.dispatchEvent(new Event('open-deposit-modal'))}
            className="text-foreground underline underline-offset-2"
          >
            Deposit USDC first
          </button>
        </p>
      )}

      {tooLow  && <p className="text-xs text-destructive">Minimum deposit is ${MIN_DEPOSIT}</p>}
      {tooHigh && <p className="text-xs text-destructive">Amount exceeds your USDC balance</p>}
      {error   && <p className="text-xs text-destructive">{error}</p>}
      {success && <p className="text-xs text-success">{success}</p>}

      <button
        onClick={deposit}
        disabled={!canDeposit}
        className="w-full rounded-md bg-primary py-3 text-sm font-medium uppercase tracking-wider text-primary-foreground hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
      >
        {depositing
          ? 'Depositing…'
          : marketClosed && num >= MIN_DEPOSIT
            ? 'Deposit & Queue for Monday'
            : `Deposit $${num > 0 ? num.toFixed(2) : '0.00'}`}
      </button>
    </div>
  );
}

// ─── Holdings Card ────────────────────────────────────────────────────────────

function HoldingsCard({
  strcBalance,
  tbillBalance,
  onWithdrawn,
}: {
  strcBalance: number;
  tbillBalance: number;
  onWithdrawn: () => void;
}) {
  const { getAccessToken } = usePrivy();
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const hasBalance = strcBalance > 0 || tbillBalance > 0;

  async function withdraw() {
    if (!hasBalance || withdrawing) return;
    setWithdrawing(true);
    setError(null);
    setStatus(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const result = await api.savingsWithdraw(token);
      setStatus(result.message);
      onWithdrawn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
          Your Holdings
        </h2>
        <button
          onClick={withdraw}
          disabled={!hasBalance || withdrawing}
          className="text-[10px] font-medium uppercase tracking-wider border border-border rounded px-2.5 py-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {withdrawing ? 'Withdrawing…' : 'Withdraw All'}
        </button>
      </div>

      {/* STRC row */}
      <div className="flex items-center justify-between py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center">
            <span className="text-[10px] font-bold">S</span>
          </div>
          <div>
            <p className="text-sm font-medium">STRC</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tokenized S&amp;P 500 · 50%</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-mono font-semibold">{strcBalance.toFixed(4)}</p>
          <p className="text-[10px] text-muted-foreground font-mono">STRC</p>
        </div>
      </div>

      {/* T-Bill row */}
      <div className="flex items-center justify-between py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center">
            <span className="text-[10px] font-bold">T</span>
          </div>
          <div>
            <p className="text-sm font-medium">Invesco T-Bill</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tokenized T-Bill · 50%</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-mono font-semibold">{tbillBalance.toFixed(4)}</p>
          <p className="text-[10px] text-muted-foreground font-mono">TBILL</p>
        </div>
      </div>

      {/* Split bar */}
      <div className="h-1 rounded-full bg-secondary overflow-hidden flex">
        <div className="bg-primary w-1/2" />
        <div className="bg-success/60 w-1/2" />
      </div>

      {status && <p className="text-xs text-success">{status}</p>}
      {error  && <p className="text-xs text-destructive">{error}</p>}

      <p className="text-[10px] text-muted-foreground">
        Live balances from INK chain · sold back to USDC via CoW Protocol
      </p>
    </div>
  );
}

// ─── Rewards Panel ────────────────────────────────────────────────────────────

function RewardsPanel({ rewards, onRedeemed }: { rewards: number; onRedeemed: () => void }) {
  const { getAccessToken } = usePrivy();
  const [products, setProducts]   = useState<Product[]>([]);
  const [selected, setSelected]   = useState<Product | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [code, setCode]           = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    getAccessToken().then(token => {
      if (!token) return;
      api.getSavingsCatalog(token).then(data => setProducts(data.products)).catch(() => {});
    });
  }, [getAccessToken]);

  async function redeem() {
    if (!selected || redeeming) return;
    setRedeeming(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const result = await api.redeemReward(token, selected.id, selected.minValue);
      setCode(result.redemptionCode);
      onRedeemed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Redemption failed');
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4 sticky top-4">
      <div>
        <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-1">
          Rewards Available
        </p>
        <p className="text-3xl font-mono font-bold">${rewards.toFixed(2)}</p>
        <p className="text-[10px] text-muted-foreground mt-1">earned from yield on your savings</p>
      </div>

      {code ? (
        <div className="rounded-md border border-success/30 bg-success/5 p-4 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-success">Gift Card Code</p>
          <p className="font-mono text-xl font-bold tracking-wider">{code}</p>
          <p className="text-xs text-muted-foreground">Use at {selected?.name}</p>
          <button
            onClick={() => { setCode(null); setSelected(null); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Redeem another →
          </button>
        </div>
      ) : rewards < 5 ? (
        <div className="rounded-md border border-border bg-secondary p-4 space-y-2">
          <p className="text-xs font-medium">Keep saving</p>
          <p className="text-xs text-muted-foreground">
            ${(5 - rewards).toFixed(2)} more in yield to unlock gift cards
          </p>
          <div className="h-1 rounded-full bg-border overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(100, (rewards / 5) * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Redeem your yield for real gift cards</p>
          <div className="grid grid-cols-2 gap-2">
            {products.map(p => (
              <button
                key={p.id}
                onClick={() => setSelected(s => s?.id === p.id ? null : p)}
                className={`flex flex-col items-start gap-1.5 rounded-md border p-3 text-left transition-colors ${
                  selected?.id === p.id
                    ? 'border-primary bg-secondary'
                    : 'border-border hover:border-foreground/20'
                }`}
              >
                <span className="text-lg">🎁</span>
                <div>
                  <p className="text-xs font-semibold">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">from ${p.minValue}</p>
                </div>
              </button>
            ))}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            onClick={redeem}
            disabled={!selected || redeeming}
            className="w-full rounded-md bg-primary py-2.5 text-xs font-medium uppercase tracking-wider text-primary-foreground hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          >
            {redeeming ? 'Redeeming…' : selected ? `Redeem ${selected.name}` : 'Select a Gift Card'}
          </button>
          <p className="text-[10px] text-muted-foreground text-center">Powered by Bitrefill</p>
        </>
      )}
    </div>
  );
}
