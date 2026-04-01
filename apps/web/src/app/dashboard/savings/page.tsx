'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { usePrivy } from '@privy-io/react-auth';
import { useSmartWallet } from '@/hooks/use-smart-wallet';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { useTokenBalance } from '@/hooks/use-token-balance';
import { api, ApiError } from '@/lib/api';

const STRC_ADDRESS  = process.env.NEXT_PUBLIC_STRC_ADDRESS  || '';
const TBILL_ADDRESS = process.env.NEXT_PUBLIC_TBILL_ADDRESS || '';
const MIN_DEPOSIT   = 20;
const DEMO_REWARDS  = 12.40;

function isMarketClosed(): boolean {
  const now  = new Date();
  const day  = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 0 || day === 6) return true;
  if (day === 5 && hour >= 20) return true;
  return false;
}

type Product = { id: string; name: string; category: string; minValue: number; logoUrl: string };

export default function SavingsPage() {
  const { ready } = useSmartWallet();
  const { balance: usdcBalance, refresh: refreshUsdc } = useUsdcBalance();
  const { balance: strcBalance, refresh: refreshStrc } = useTokenBalance(STRC_ADDRESS);
  const { balance: tbillBalance, refresh: refreshTbill } = useTokenBalance(TBILL_ADDRESS);
  const [products, setProducts] = useState<Product[]>([]);
  const { getAccessToken } = usePrivy();

  useEffect(() => {
    getAccessToken().then(token => {
      if (!token) return;
      api.getSavingsCatalog(token).then(d => setProducts(d.products)).catch(() => {});
    });
  }, [getAccessToken]);

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

  return (
    <div className="space-y-4">
      <ReadyToSpendHero rewards={DEMO_REWARDS} products={products} />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-4">
          <DepositSection usdcBalance={usdcBalance} onDeposited={refreshAll} />
          <HoldingsCard strcBalance={strcBalance} tbillBalance={tbillBalance} onWithdrawn={refreshAll} />
        </div>
        <GiftCardsPanel rewards={DEMO_REWARDS} products={products} onRedeemed={refreshAll} />
      </div>
    </div>
  );
}

// ─── Ready to Spend Hero ──────────────────────────────────────────────────────

function ReadyToSpendHero({ rewards, products }: { rewards: number; products: Product[] }) {
  const { getAccessToken } = usePrivy();
  const [redeeming, setRedeeming] = useState(false);
  const [code, setCode]           = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const sorted = [...products].sort((a, b) => {
    const aAfford = rewards >= a.minValue;
    const bAfford = rewards >= b.minValue;
    if (aAfford && !bAfford) return -1;
    if (!aAfford && bAfford) return 1;
    return Math.abs(rewards - a.minValue) - Math.abs(rewards - b.minValue);
  });

  const closest3   = sorted.slice(0, 3);
  const topPick    = sorted[0];
  const awayAmount = topPick ? Math.max(0, topPick.minValue - rewards) : 0;
  const canRedeem  = topPick ? rewards >= topPick.minValue : false;

  async function redeemTop() {
    if (!topPick || !canRedeem || redeeming) return;
    setRedeeming(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const result = await api.redeemReward(token, topPick.id, topPick.minValue);
      setCode(result.redemptionCode);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Redemption failed');
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 flex items-center justify-between gap-6 border-l-4" style={{ borderLeftColor: '#d97706' }}>
      <div>
        <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-2">
          Ready to Spend
        </p>
        {code ? (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-success mb-1">Gift Card Code</p>
            <p className="text-4xl font-mono font-bold tracking-wider text-success">{code}</p>
            <p className="text-xs text-muted-foreground mt-1">Use at {topPick?.name}</p>
            <button onClick={() => setCode(null)} className="text-xs text-muted-foreground hover:text-foreground mt-2 transition-colors">
              Redeem another
            </button>
          </div>
        ) : (
          <>
            <p className="text-5xl font-mono font-bold tracking-tight">${rewards.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">yield earned on your savings</p>
          </>
        )}
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>

      {!code && products.length > 0 && (
        <div className="flex flex-col items-end gap-3 shrink-0">
          <div className="flex flex-col items-end gap-2">
            <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Closest To</p>
            <div className="flex gap-2">
              {closest3.map(p => (
                <div key={p.id} className="w-10 h-10 rounded-lg bg-white overflow-hidden flex items-center justify-center p-1">
                  <Image src={p.logoUrl} alt={p.name} width={32} height={32} className="object-contain" unoptimized />
                </div>
              ))}
            </div>
            <p className="text-xs font-mono text-muted-foreground">
              {canRedeem
                ? `Redeem ${topPick?.name} now`
                : `$${awayAmount.toFixed(2)} away from ${topPick?.name}`}
            </p>
          </div>
          <button
            onClick={redeemTop}
            disabled={!canRedeem || redeeming}
            className="rounded-md border border-border bg-secondary/80 px-5 py-2 text-xs font-medium uppercase tracking-widest hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {redeeming ? 'Redeeming...' : 'Redeem →'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Deposit Section ──────────────────────────────────────────────────────────

function DepositSection({ usdcBalance, onDeposited }: { usdcBalance: number; onDeposited: () => void }) {
  const { getAccessToken } = usePrivy();
  const [amount, setAmount]         = useState('');
  const [depositing, setDepositing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);

  const num          = parseFloat(amount) || 0;
  const marketClosed = isMarketClosed();
  const tooLow       = num > 0 && num < MIN_DEPOSIT;
  const tooHigh      = num > usdcBalance;
  const canDeposit   = num >= MIN_DEPOSIT && !tooHigh && !depositing && usdcBalance > 0;
  const quickAmounts = [50, 100, 250, 500].filter(q => q <= usdcBalance + 0.01);

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
    <div className="rounded-lg border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Deposit</p>
        <span className="text-xs font-mono text-muted-foreground">
          Balance: <span className="text-foreground font-medium">{usdcBalance.toFixed(2)} USDC</span>
        </span>
      </div>

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

      {usdcBalance === 0 && (
        <p className="text-xs text-muted-foreground">
          No USDC in your wallet.{' '}
          <button onClick={() => document.dispatchEvent(new Event('open-deposit-modal'))} className="text-foreground underline underline-offset-2">
            Deposit USDC first
          </button>
        </p>
      )}
      {tooLow  && <p className="text-xs text-destructive">Minimum deposit is ${MIN_DEPOSIT}</p>}
      {tooHigh && <p className="text-xs text-destructive">Amount exceeds your USDC balance</p>}
      {error   && <p className="text-xs text-destructive">{error}</p>}
      {success && <p className="text-xs text-success">{success}</p>}
      {marketClosed && num >= MIN_DEPOSIT && <p className="text-xs text-warning">Markets closed — will allocate Monday open</p>}

      <button
        onClick={deposit}
        disabled={!canDeposit}
        className="w-full rounded-md bg-primary py-3 text-sm font-medium uppercase tracking-wider text-primary-foreground hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
      >
        {depositing ? 'Depositing...' : 'Deposit'}
      </button>
    </div>
  );
}

// ─── Holdings Card ────────────────────────────────────────────────────────────

function HoldingsCard({ strcBalance, tbillBalance, onWithdrawn }: { strcBalance: number; tbillBalance: number; onWithdrawn: () => void }) {
  const { getAccessToken } = usePrivy();
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function withdraw() {
    if (withdrawing) return;
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
    <div className="rounded-lg border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Your Holdings</p>
        <button
          onClick={withdraw}
          disabled={withdrawing || (strcBalance === 0 && tbillBalance === 0)}
          className="text-[10px] font-medium uppercase tracking-wider border border-border rounded px-2.5 py-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {withdrawing ? 'Withdrawing...' : 'Withdraw All'}
        </button>
      </div>

      <div className="flex items-center justify-between py-2.5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center">
            <span className="text-[10px] font-bold">S</span>
          </div>
          <div>
            <p className="text-sm font-medium">STRC</p>
            <p className="text-[10px] text-muted-foreground tracking-wide">Tokenized Stock · 50%</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-mono font-semibold">{strcBalance.toFixed(4)}</p>
          <p className="text-[10px] text-muted-foreground font-mono">STRC</p>
        </div>
      </div>

      <div className="flex items-center justify-between py-2.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center">
            <span className="text-[10px] font-bold">T</span>
          </div>
          <div>
            <p className="text-sm font-medium">Invesco T-Bill</p>
            <p className="text-[10px] text-muted-foreground tracking-wide">Tokenized T-Bill · 50%</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-mono font-semibold">{tbillBalance.toFixed(4)}</p>
          <p className="text-[10px] text-muted-foreground font-mono">TBILL</p>
        </div>
      </div>

      <div className="h-1 rounded-full bg-secondary overflow-hidden flex">
        <div className="bg-foreground w-1/2" />
        <div className="bg-success/60 w-1/2" />
      </div>

      {status && <p className="text-xs text-success">{status}</p>}
      {error  && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-[10px] text-muted-foreground">Live balances · updates every 15s</p>
    </div>
  );
}

// ─── Gift Cards Panel ─────────────────────────────────────────────────────────

function GiftCardsPanel({ rewards, products, onRedeemed }: { rewards: number; products: Product[]; onRedeemed: () => void }) {
  const { getAccessToken } = usePrivy();
  const [selected, setSelected]   = useState<Product | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [code, setCode]           = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    if (products.length > 0 && !selected) {
      setSelected(products[0]);
    }
  }, [products, selected]);

  async function redeem() {
    if (!selected || redeeming || rewards < selected.minValue) return;
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

  const canRedeem = selected ? rewards >= selected.minValue : false;

  return (
    <div className="rounded-lg border border-border bg-card flex flex-col h-fit">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Gift Cards</p>
        <span className="text-xs font-mono text-success font-medium">${rewards.toFixed(2)} available</span>
      </div>

      {code ? (
        <div className="flex flex-col items-center justify-center p-6 space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-success">Gift Card Code</p>
          <p className="font-mono text-2xl font-bold tracking-wider">{code}</p>
          <p className="text-xs text-muted-foreground">Use at {selected?.name}</p>
          <button onClick={() => setCode(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Redeem another
          </button>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border">
            {products.map(p => {
              const affordable = rewards >= p.minValue;
              const away       = p.minValue - rewards;
              const isSelected = selected?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-secondary/50 transition-colors relative"
                >
                  {isSelected && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-foreground rounded-r" />}
                  <div className="w-9 h-9 rounded-lg bg-white overflow-hidden flex items-center justify-center p-1 shrink-0">
                    <Image src={p.logoUrl} alt={p.name} width={28} height={28} className="object-contain" unoptimized />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">from ${p.minValue}</p>
                  </div>
                  {affordable
                    ? <span className="text-[10px] font-medium text-success shrink-0">&#10003; Now</span>
                    : <span className="text-[10px] font-mono text-muted-foreground shrink-0">${away.toFixed(2)} away</span>
                  }
                </button>
              );
            })}
          </div>

          <div className="p-4 border-t border-border space-y-2">
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              onClick={redeem}
              disabled={!selected || redeeming || !canRedeem}
              className="w-full rounded-md bg-foreground text-background py-3 text-xs font-medium uppercase tracking-widest hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
            >
              {redeeming ? 'Redeeming...' : selected ? `Redeem ${selected.name}` : 'Select a Gift Card'}
            </button>
            <p className="text-[10px] text-muted-foreground text-center">Powered by Bitrefill</p>
          </div>
        </>
      )}
    </div>
  );
}
