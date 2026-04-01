'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { cn, formatUsd, formatBigInt } from '@/lib/utils';
import { useStrcxPrice } from '@/hooks/use-strcx-price';
import { useMarketRate } from '@/hooks/use-market-rate';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { usePosition } from '@/hooks/use-position';
import { api, ApiError } from '@/lib/api';
import { LoopStatus } from './loop-status';

const STRC_BASE_APY = 11.5;
const LEVERAGE_OPTIONS = [2, 3, 5] as const;

const UNWIND_OPTIONS = [
  { value: 0, label: 'Full', sublabel: 'Receive USDC' },
  { value: 1, label: '1×', sublabel: 'Hold STRC' },
  { value: 2, label: '2×', sublabel: 'Keep 2× leverage' },
  { value: 3, label: '3×', sublabel: 'Keep 3× leverage' },
] as const;

// ── Loop tab ──────────────────────────────────────────────────────────────────

function LoopTab() {
  const { getAccessToken } = usePrivy();
  const { price: strcPrice } = useStrcxPrice();
  const { borrowApy } = useMarketRate();
  const { balance: usdcBalance, loading: balanceLoading } = useUsdcBalance();
  const [usdcAmount, setUsdcAmount] = useState('');
  const [leverage, setLeverage] = useState<number>(2);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeLoopId, setActiveLoopId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!usdcAmount || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const usdcRaw = BigInt(Math.round(parseFloat(usdcAmount) * 1e6)).toString();
      const result = await api.startLoop(token, {
        strcAmount: usdcRaw,
        targetLeverage: leverage,
        maxSlippageBps: 0,
      });
      setActiveLoopId(result.id);
      setUsdcAmount('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start loop');
    } finally {
      setIsSubmitting(false);
    }
  };

  const amountUsdc = parseFloat(usdcAmount) || 0;
  const strcEquivalent = strcPrice > 0 ? amountUsdc / strcPrice : 0;
  const totalExposureUsdc = amountUsdc * leverage;
  const debtUsdc = totalExposureUsdc - amountUsdc;
  const effectiveBorrow = borrowApy ?? 4.2;
  const netApy = (STRC_BASE_APY * leverage - effectiveBorrow * (leverage - 1)).toFixed(1);

  if (activeLoopId) {
    return <LoopStatus loopId={activeLoopId} onClose={() => setActiveLoopId(null)} />;
  }

  return (
    <div className="space-y-5">
      {/* USDC balance row */}
      <div className="flex items-center justify-between rounded-md bg-secondary px-3 py-2">
        <span className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">USDC Balance</span>
        {balanceLoading ? (
          <div className="h-3 w-16 bg-muted animate-pulse rounded" />
        ) : usdcBalance > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-foreground">
              ${usdcBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <button
              onClick={() => setUsdcAmount(usdcBalance.toFixed(2))}
              className="text-[10px] font-mono font-semibold tracking-widest uppercase text-primary border border-primary/30 rounded px-1.5 py-0.5 hover:bg-primary/10 transition-colors"
            >
              MAX
            </button>
          </div>
        ) : (
          <button
            onClick={() => document.dispatchEvent(new CustomEvent('open-deposit-modal'))}
            className="text-[10px] font-mono font-medium tracking-widest uppercase text-foreground border border-border rounded px-2 py-0.5 hover:bg-card transition-colors"
          >
            + Deposit
          </button>
        )}
      </div>

      {/* Amount input */}
      <div className="space-y-2">
        <label className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
          Deposit Amount
        </label>
        <div className="relative">
          <input
            type="text"
            value={usdcAmount}
            onChange={(e) => setUsdcAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            className="w-full rounded-md border border-border bg-secondary px-3 py-3 font-mono text-lg placeholder:text-muted-foreground focus:border-foreground focus:outline-none transition-colors"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tracking-wide">
            USDC
          </span>
        </div>
        {amountUsdc > 0 && (
          <div className="text-[10px] text-muted-foreground font-mono text-right">
            ~{strcEquivalent.toFixed(2)} STRCx at {formatUsd(strcPrice)}
          </div>
        )}
      </div>

      {/* Leverage selector */}
      <div className="space-y-3">
        <label className="text-xs text-muted-foreground">Target Leverage</label>
        <div className="grid grid-cols-3 gap-2">
          {LEVERAGE_OPTIONS.map((lev) => (
            <button
              key={lev}
              onClick={() => setLeverage(lev)}
              className={cn(
                'rounded-md border py-3 text-center font-mono text-sm font-semibold transition-all',
                leverage === lev
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-card border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
              )}
            >
              {lev}×
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!usdcAmount || isSubmitting}
        className="w-full rounded-md bg-primary py-3.5 text-xs font-medium tracking-widest uppercase text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Opening Position...' : `Deposit & Loop ${leverage}×`}
      </button>

      {amountUsdc > 0 && (
        <div className="rounded-md border border-border bg-secondary p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">STRCx purchased</span>
            <span className="font-mono">~{strcEquivalent.toFixed(2)} STRCx</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Total exposure</span>
            <span className="font-mono">{formatUsd(totalExposureUsdc)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Est. debt</span>
            <span className="font-mono">{formatUsd(debtUsdc)} USDC</span>
          </div>
          <div className="flex justify-between text-xs border-t border-border pt-1.5">
            <span className="text-muted-foreground">Net APY</span>
            <span className="font-mono font-semibold text-success">+{netApy}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Unwind progress poller ────────────────────────────────────────────────────
// Since there's no /unwind/:id/status endpoint, we poll the on-chain position
// until debt reaches zero (full unwind) or leverage drops to target.

function UnwindProgress({ onDone }: { onDone: () => void }) {
  const { data: positionData, refetch } = usePosition();

  useEffect(() => {
    const interval = setInterval(refetch, 5_000);
    return () => clearInterval(interval);
  }, [refetch]);

  const isDone = !positionData?.hasPosition;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className={cn(
          'text-[10px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded border',
          isDone ? 'border-success/50 text-success' : 'border-primary/50 text-primary',
        )}>
          {isDone ? 'COMPLETED' : 'IN PROGRESS'}
        </span>
      </div>

      <div className="space-y-3">
        {(['Repaying USDC debt', 'Unwrapping wSTRC → STRCx', 'Withdrawing collateral'] as const).map((step, i) => (
          <div key={step} className="flex items-center gap-3 text-xs">
            <div className={cn(
              'h-6 w-6 rounded-full border flex items-center justify-center text-[10px] font-mono font-bold shrink-0',
              isDone
                ? 'border-success bg-success/10 text-success'
                : 'border-primary bg-primary/10 text-primary animate-pulse',
            )}>
              {isDone ? '✓' : i + 1}
            </div>
            <span className="text-muted-foreground">{step}</span>
          </div>
        ))}
      </div>

      {!isDone && (
        <p className="text-[10px] text-muted-foreground text-center animate-pulse">
          Checking position every 5s...
        </p>
      )}

      {isDone && (
        <button
          onClick={onDone}
          className="w-full rounded-md bg-secondary py-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          Done
        </button>
      )}
    </div>
  );
}

// ── Unwind tab ─────────────────────────────────────────────────────────────────

function UnwindTab() {
  const { getAccessToken } = usePrivy();
  const { data: positionData } = usePosition();
  const { price: strcPrice } = useStrcxPrice();
  const [targetLeverage, setTargetLeverage] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [unwindStarted, setUnwindStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const position = positionData?.position;
  const collateralStrc_ = position ? parseFloat(formatBigInt(position.collateralStrc)) : 0;
  const debtUsd_ = position ? parseFloat(formatBigInt(position.debtUsdc, 6, 2)) : 0;
  const hasPosition = positionData?.hasPosition && position && (collateralStrc_ >= 0.001 || debtUsd_ >= 0.01);

  const collateralStrc = hasPosition ? collateralStrc_ : 0;
  const collateralUsd = collateralStrc * strcPrice;
  const debtUsd = hasPosition ? debtUsd_ : 0;
  const equityUsd = collateralUsd - debtUsd;
  const currentLeverage = hasPosition ? position.effectiveLeverage : 0;

  const availableOptions = UNWIND_OPTIONS.filter(
    (opt) => !currentLeverage || opt.value < currentLeverage,
  );

  const handleUnwind = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      // activeLoop is only set for PENDING/IN_PROGRESS loops.
      // Fall back to the most recent loop from history so completed
      // loops (which still hold an open Morpho position) can also unwind.
      let loopExecutionId = positionData?.activeLoop?.id;
      if (!loopExecutionId) {
        const history = await api.getLoopHistory(token, 1, 0);
        loopExecutionId = history.loops[0]?.id;
      }
      if (!loopExecutionId) throw new Error('No loop found to unwind');

      await api.startUnwind(token, {
        loopExecutionId,
        ...(targetLeverage > 0 ? { targetLeverage } : {}),
      } as any);

      setUnwindStarted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start unwind');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (unwindStarted) {
    return <UnwindProgress onDone={() => setUnwindStarted(false)} />;
  }

  if (!hasPosition) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[380px] text-center">
        <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </div>
        <p className="text-sm font-medium text-muted-foreground">No active position</p>
        <p className="text-xs text-muted-foreground mt-1">Start a loop to build your leveraged STRC position.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Position summary */}
      <div className="rounded-md border border-border bg-secondary p-4 space-y-2">
        <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-3">
          Position Summary
        </p>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Collateral</span>
          <span className="font-mono">{formatUsd(collateralUsd)} <span className="text-muted-foreground">({collateralStrc.toFixed(2)} STRCx)</span></span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Debt to repay</span>
          <span className="font-mono text-destructive/80">−{formatUsd(debtUsd)} USDC</span>
        </div>
        <div className="flex justify-between text-xs border-t border-border pt-2 mt-1">
          <span className="text-muted-foreground font-medium">You receive</span>
          <span className="font-mono font-semibold text-success">~{formatUsd(equityUsd)} USDC</span>
        </div>
      </div>

      {/* Target leverage */}
      <div className="space-y-3">
        <label className="text-xs text-muted-foreground">Unwind to</label>
        <div className="grid grid-cols-2 gap-2">
          {availableOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTargetLeverage(opt.value)}
              className={cn(
                'rounded-md border py-3 px-3 text-left transition-all',
                targetLeverage === opt.value
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-card border-border hover:border-foreground/30',
              )}
            >
              <div className={cn('text-sm font-mono font-semibold', targetLeverage === opt.value ? 'text-background' : 'text-foreground')}>
                {opt.label}
              </div>
              <div className={cn('text-[10px] mt-0.5', targetLeverage === opt.value ? 'text-background/60' : 'text-muted-foreground')}>
                {opt.sublabel}
              </div>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <button
        onClick={handleUnwind}
        disabled={isSubmitting}
        className="w-full rounded-md border border-destructive/40 bg-destructive/5 py-3.5 text-xs font-medium tracking-widest uppercase text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSubmitting
          ? 'Starting Unwind...'
          : targetLeverage === 0
            ? 'Unwind Full Position'
            : `Unwind to ${targetLeverage}×`}
      </button>

      <p className="text-[9px] text-muted-foreground text-center">
        Multi-step process · Price may move during execution · Cannot be cancelled once started
      </p>
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

type Tab = 'loop' | 'unwind';

export function LoopCard() {
  const [tab, setTab] = useState<Tab>('loop');
  const { price: strcPrice } = useStrcxPrice();

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5 min-h-[560px]">
      {/* Header with tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-md border border-border bg-secondary p-0.5">
          <button
            onClick={() => setTab('loop')}
            className={cn(
              'rounded px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase transition-all',
              tab === 'loop'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Start Loop
          </button>
          <button
            onClick={() => setTab('unwind')}
            className={cn(
              'rounded px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase transition-all',
              tab === 'unwind'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Unwind
          </button>
        </div>
        {tab === 'loop' && (
          <span className="text-[10px] text-muted-foreground font-mono">
            STRC/USD <span className="text-foreground font-medium">{formatUsd(strcPrice)}</span>
          </span>
        )}
      </div>

      <div className="min-h-[420px]">
        {tab === 'loop' ? <LoopTab /> : <UnwindTab />}
      </div>
    </div>
  );
}
