'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { cn, formatUsd, formatBigInt } from '@/lib/utils';
import { api } from '@/lib/api';
import { usePosition } from '@/hooks/use-position';
import { useStrcxPrice } from '@/hooks/use-strcx-price';
import { useMarketRate } from '@/hooks/use-market-rate';
import { PerformanceChart } from '@/components/vaults/performance-chart';
import { ContractsPanel } from '@/components/dashboard/contracts-panel';
import { SpreadsSpinner } from '@/components/shared/spreads-spinner';

function HealthFactorGauge({ hf }: { hf: number }) {
  const [displayPct, setDisplayPct] = useState(0);
  const [displayHf, setDisplayHf] = useState(1);
  const targetPct = Math.min(Math.max((hf - 1) / 2, 0), 1) * 100;

  useEffect(() => {
    const timeout = setTimeout(() => {
      const start = performance.now();
      function tick(now: number) {
        const progress = Math.min((now - start) / 900, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayPct(eased * targetPct);
        setDisplayHf(1 + eased * (hf - 1));
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, 200);
    return () => clearTimeout(timeout);
  }, [hf, targetPct]);

  const color = hf > 2 ? 'text-success' : hf > 1.5 ? 'text-warning' : 'text-destructive';
  const barColor = hf > 2 ? 'bg-success' : hf > 1.5 ? 'bg-warning' : 'bg-destructive';
  const label = hf > 2 ? 'SAFE' : hf > 1.5 ? 'CAUTION' : 'DANGER';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Health Factor</span>
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-mono font-semibold uppercase tracking-wider', color)}>{label}</span>
          <span className={cn('text-lg font-mono font-bold', color)}>{displayHf.toFixed(2)}</span>
        </div>
      </div>
      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn('absolute left-0 top-0 h-full rounded-full', barColor)} style={{ width: `${displayPct}%`, transition: 'none' }} />
        <div className="absolute top-0 h-full w-px bg-warning/50" style={{ left: '25%' }} />
        <div className="absolute top-0 h-full w-px bg-success/50" style={{ left: '50%' }} />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
        <span>1.0 LIQ</span><span>1.5</span><span>2.0</span><span>3.0+</span>
      </div>
    </div>
  );
}

// ── How it works — shown when no position ─────────────────────────────────────

const STEPS = [
  {
    n: '01',
    title: 'Deposit USDC',
    desc: 'Fund your smart wallet with USDC to get started.',
  },
  {
    n: '02',
    title: 'Buy STRCx',
    desc: 'USDC is swapped for STRCx via CoW Swap — zero slippage.',
  },
  {
    n: '03',
    title: 'Supply Collateral',
    desc: 'STRCx is supplied to Morpho Blue as collateral.',
  },
  {
    n: '04',
    title: 'Borrow & Loop',
    desc: 'USDC is borrowed against your collateral and the cycle repeats — up to 5×.',
  },
];

function HowItWorks() {
  return (
    <div className="flex flex-col justify-center h-full py-6 px-2 space-y-1">
      <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-5">
        How it works
      </p>
      <div className="space-y-0">
        {STEPS.map((step, i) => (
          <div key={step.n} className="flex gap-4">
            {/* Connector column */}
            <div className="flex flex-col items-center">
              <div className="w-7 h-7 rounded-full border border-border bg-secondary flex items-center justify-center shrink-0">
                <span className="text-[9px] font-mono font-bold text-muted-foreground">{step.n}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="w-px flex-1 bg-border my-1" style={{ minHeight: 24 }} />
              )}
            </div>
            {/* Content */}
            <div className="pb-6">
              <p className="text-sm font-medium text-foreground">{step.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

// ── Position tab ──────────────────────────────────────────────────────────────

const STRC_STAKING_APY = 11.5;

function PositionTab() {
  const { data: positionData, loading } = usePosition();
  const { price: strcPrice, stale, source } = useStrcxPrice();
  const { borrowApy } = useMarketRate();
  const effectiveBorrowApy = borrowApy ?? 4.2;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <SpreadsSpinner size={32} />
      </div>
    );
  }

  const hasPosition = positionData?.hasPosition && positionData.position;
  const p = hasPosition ? positionData.position : null;

  const collateralStrc = p ? parseFloat(formatBigInt(p.collateralStrc)) : 0;
  const collateralUsd = collateralStrc * strcPrice;
  const debtUsd = p ? parseFloat(formatBigInt(p.debtUsdc, 6, 2)) : 0;
  const equityUsd = collateralUsd - debtUsd;
  const leverage = p ? p.effectiveLeverage : 0;
  const netYield = leverage > 0 ? (STRC_STAKING_APY * leverage) - (effectiveBorrowApy * (leverage - 1)) : 0;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Position</span>
          {hasPosition ? (
            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border border-success/30 bg-success/10 text-success">ACTIVE</span>
          ) : (
            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border border-border text-muted-foreground">NO POSITION</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">STRCx/USD</span>
          <span className="text-sm font-mono font-semibold">{formatUsd(strcPrice)}</span>
          {!stale && source !== 'fallback' && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
            </span>
          )}
        </div>
      </div>

      {/* Key metrics — always visible */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-secondary p-3">
          <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">Equity</div>
          <div className={cn('text-xl font-mono font-bold', hasPosition ? 'text-foreground' : 'text-muted-foreground')}>
            {hasPosition ? formatUsd(equityUsd) : '$0.00'}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
            {hasPosition ? `${(equityUsd / strcPrice).toFixed(2)} STRCx` : '—'}
          </div>
        </div>
        <div className="rounded-md border border-border bg-secondary p-3">
          <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">Current APY</div>
          <div className={cn('text-xl font-mono font-bold', hasPosition ? 'text-success' : 'text-muted-foreground')}>
            {hasPosition ? `+${netYield.toFixed(1)}%` : '—'}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
            {hasPosition ? `at ${leverage.toFixed(1)}× leverage` : 'No active loop'}
          </div>
        </div>
        <div className="rounded-md border border-border bg-secondary p-3">
          <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">Loan</div>
          <div className={cn('text-xl font-mono font-bold', hasPosition ? 'text-destructive/80' : 'text-muted-foreground')}>
            {hasPosition ? formatUsd(debtUsd) : '$0.00'}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
            {hasPosition ? 'USDC borrowed' : '—'}
          </div>
        </div>
        <div className="rounded-md border border-border bg-secondary p-3">
          <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">Collateral</div>
          <div className={cn('text-xl font-mono font-bold', hasPosition ? 'text-foreground' : 'text-muted-foreground')}>
            {hasPosition ? formatUsd(collateralUsd) : '$0.00'}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
            {hasPosition ? `${collateralStrc.toFixed(2)} STRCx` : '—'}
          </div>
        </div>
      </div>

      {/* Health factor — show gauge when active, flat bar when not */}
      {hasPosition && p ? (
        <>
          <HealthFactorGauge hf={p.healthFactor} />
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Leverage</span>
              <span className="text-sm font-mono font-semibold text-primary">{leverage.toFixed(1)}×</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Liq. Price</span>
              <span className="text-sm font-mono font-semibold">{formatUsd(p.liquidationPrice)}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Health Factor</span>
            <span className="text-xs font-mono text-muted-foreground">—</span>
          </div>
          <div className="h-2 rounded-full bg-muted" />
          <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
            <span>1.0 LIQ</span><span>1.5</span><span>2.0</span><span>3.0+</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  COMPLETED: 'text-success bg-success/10 border-success/20',
  COMPLETED_PARTIAL: 'text-warning bg-warning/10 border-warning/20',
  FAILED: 'text-destructive bg-destructive/10 border-destructive/20',
  IN_PROGRESS: 'text-primary bg-primary/10 border-primary/20',
  PENDING: 'text-muted-foreground bg-muted/50 border-border',
};

const PAGE_SIZE = 8;

function HistoryTab() {
  const { getAccessToken } = usePrivy();
  const [loops, setLoops] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchLoops = useCallback(async (offset = 0) => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const data = await api.getLoopHistory(token, PAGE_SIZE, offset);
      setLoops(data.loops);
      setTotal(data.total);
    } catch { /* keep existing */ } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    setLoading(true);
    fetchLoops(page * PAGE_SIZE);
    const interval = setInterval(() => fetchLoops(page * PAGE_SIZE), 15_000);
    return () => clearInterval(interval);
  }, [fetchLoops, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading) {
    return (
      <div className="p-6 space-y-3 animate-pulse">
        {[1,2,3,4].map(i => <div key={i} className="h-10 bg-muted rounded" />)}
      </div>
    );
  }

  if (loops.length === 0) {
    return (
      <div className="p-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">No loops yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Start a loop to see your history here.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-2 text-left font-medium">Date</th>
              <th className="py-2 text-right font-medium">USDC</th>
              <th className="py-2 text-right font-medium">Target</th>
              <th className="py-2 text-right font-medium">Achieved</th>
              <th className="py-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loops.map((loop) => (
              <tr key={loop.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors">
                <td className="py-3 text-left font-mono text-xs">{new Date(loop.createdAt).toLocaleDateString()}</td>
                <td className="py-3 text-right font-mono">{formatUsd(parseFloat(loop.strcAmount) / 1e6)}</td>
                <td className="py-3 text-right font-mono">{loop.targetLeverage}×</td>
                <td className="py-3 text-right font-mono text-primary">
                  {loop.effectiveLeverage ? `${loop.effectiveLeverage.toFixed(1)}×` : '—'}
                </td>
                <td className="py-3 text-right">
                  {loop.status === 'COMPLETED_PARTIAL' ? (
                    <div className="relative inline-block group">
                      <span className={cn('inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono cursor-default', statusColors['COMPLETED_PARTIAL'])}>
                        PARTIAL
                      </span>
                      <div className="absolute right-0 bottom-full mb-2 w-52 rounded-md border border-border bg-card shadow-lg p-2.5 text-[10px] font-mono text-muted-foreground leading-relaxed z-10 hidden group-hover:block">
                        Loop reached partial leverage — the health factor got too close to the liquidation threshold before hitting your target. Your position is still open and earning yield.
                      </div>
                    </div>
                  ) : (
                    <span className={cn('inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono', statusColors[loop.status] ?? statusColors.PENDING)}>
                      {loop.status.replace('_', ' ')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-border/50 mt-4">
          <span className="text-[10px] text-muted-foreground font-mono">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="rounded border border-border px-2.5 py-1 text-[10px] font-mono text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed">Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="rounded border border-border px-2.5 py-1 text-[10px] font-mono text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main left panel ───────────────────────────────────────────────────────────

type Tab = 'position' | 'history' | 'performance' | 'info';

export function LeftPanel() {
  const [tab, setTab] = useState<Tab>('position');

  const tabs: { value: Tab; label: string }[] = [
    { value: 'position', label: 'Position' },
    { value: 'history', label: 'History' },
    { value: 'performance', label: 'Performance' },
    { value: 'info', label: 'Info' },
  ];

  return (
    <div className="rounded-lg border border-border bg-card flex flex-col min-h-[560px]">
      {/* Tab bar */}
      <div className="flex border-b border-border px-6 pt-4 shrink-0">
        {tabs.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              'pb-3 px-1 mr-6 text-xs font-medium transition-colors border-b-2',
              tab === value
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1">
        {tab === 'position' && <PositionTab />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'performance' && <PerformanceChart embedded />}
        {tab === 'info' && <div className="p-6 space-y-6"><HowItWorks /><ContractsPanel embedded /></div>}
      </div>
    </div>
  );
}
