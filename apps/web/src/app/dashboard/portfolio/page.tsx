'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { cn, formatUsd, formatBigInt } from '@/lib/utils';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { usePosition } from '@/hooks/use-position';
import { useStrcxPrice } from '@/hooks/use-strcx-price';
import { useStrcBalance } from '@/hooks/use-strc-balance';
import { useTbill } from '@/hooks/use-tbill';
import { useMorphoSupply } from '@/hooks/use-morpho-supply';
import { api } from '@/lib/api';
import { SpreadsSpinner } from '@/components/shared/spreads-spinner';

// ── Donut chart ───────────────────────────────────────────────────────────────

interface Segment { label: string; value: number; color: string; }

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, R: number, r: number, start: number, end: number) {
  if (end - start >= 360) end = start + 359.99;
  const os = polarToCartesian(cx, cy, R, start);
  const oe = polarToCartesian(cx, cy, R, end);
  const is_ = polarToCartesian(cx, cy, r, start);
  const ie = polarToCartesian(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${os.x} ${os.y} A ${R} ${R} 0 ${large} 1 ${oe.x} ${oe.y} L ${ie.x} ${ie.y} A ${r} ${r} 0 ${large} 0 ${is_.x} ${is_.y} Z`;
}

function DonutChart({ segments, total }: { segments: Segment[]; total: number }) {
  const cx = 100; const cy = 100; const R = 82; const r = 58; const gap = 2;
  let cursor = 0;
  const arcs = segments.map((seg) => {
    const sweep = (seg.value / total) * 360;
    const path = arcPath(cx, cy, R, r, cursor + gap / 2, cursor + sweep - gap / 2);
    cursor += sweep;
    return { ...seg, path, sweep };
  });

  return (
    <div className="relative flex items-center justify-center">
      <svg viewBox="0 0 200 200" className="w-48 h-48">
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={(R + r) / 2} fill="none" stroke="#e5e7eb" strokeWidth={R - r} />
        ) : (
          arcs.map((arc) => arc.sweep > 0.5 && (
            <path key={arc.label} d={arc.path} fill={arc.color} className="transition-all duration-500" />
          ))
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-[9px] font-mono text-muted-foreground tracking-widest uppercase">Total</span>
        <span className="text-lg font-mono font-bold">{formatUsd(total)}</span>
      </div>
    </div>
  );
}

// ── Recent activity tab ───────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  COMPLETED: 'text-success bg-success/10 border-success/20',
  COMPLETED_PARTIAL: 'text-warning bg-warning/10 border-warning/20',
  FAILED: 'text-destructive bg-destructive/10 border-destructive/20',
  IN_PROGRESS: 'text-primary bg-primary/10 border-primary/20',
  PENDING: 'text-muted-foreground bg-muted/50 border-border',
};

const PAGE_SIZE = 8;

function RecentActivity() {
  const { getAccessToken } = usePrivy();
  const [loops, setLoops] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async (offset = 0) => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const data = await api.getLoopHistory(token, PAGE_SIZE, offset);
      setLoops(data.loops);
      setTotal(data.total);
    } catch {} finally { setLoading(false); }
  }, [getAccessToken]);

  useEffect(() => {
    setLoading(true);
    fetch_(page * PAGE_SIZE);
    const iv = setInterval(() => fetch_(page * PAGE_SIZE), 15_000);
    return () => clearInterval(iv);
  }, [fetch_, page]);

  if (loading) return <div className="flex items-center justify-center p-12"><SpreadsSpinner size={28} /></div>;

  if (loops.length === 0) return (
    <div className="p-8 text-center">
      <p className="text-sm text-muted-foreground">No activity yet.</p>
    </div>
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-2 text-left font-medium">Date</th>
              <th className="py-2 text-right font-medium">USDC In</th>
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
                <td className="py-3 text-right font-mono text-primary">{loop.effectiveLeverage ? `${loop.effectiveLeverage.toFixed(1)}×` : '—'}</td>
                <td className="py-3 text-right">
                  <span className={cn('inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono', statusColors[loop.status] ?? statusColors.PENDING)}>
                    {loop.status.replace('_', ' ')}
                  </span>
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

// ── Main page ─────────────────────────────────────────────────────────────────

const ASSET_COLORS = {
  usdc:        '#16a34a',
  looped:      '#1a3520',
  strc:        '#e05c00',
  wstrc:       '#b84500',
  tbill:       '#3b82f6',
  morphoLend:  '#0ea5e9',
};

export default function Portfolio() {
  const [tab, setTab] = useState<'positions' | 'activity'>('positions');
  const { balance: usdcBalance, loading: usdcLoading } = useUsdcBalance();
  const { data: positionData, loading: posLoading } = usePosition();
  const { price: strcPrice, change24h, changePct24h } = useStrcxPrice();
  const strcBalance = useStrcBalance();
  const { balance: tbillBalance, price: tbillPrice, loading: tbillLoading } = useTbill();
  const { supplyUsd: morphoSupplyUsd, loading: morphoSupplyLoading } = useMorphoSupply();

  const loading = usdcLoading || posLoading || strcBalance.loading || tbillLoading || morphoSupplyLoading;

  // Looped position
  const position = positionData?.hasPosition ? positionData.position : null;
  const collateralStrcRaw = position ? parseFloat(formatBigInt(position.collateralStrc)) : 0;
  // Fallback: if collateralStrc is 0 but wSTRC collateral exists, approximate using 1:1 exchange rate
  const collateralWstrcRaw = position ? parseFloat(formatBigInt(position.collateralWstrc ?? '0')) : 0;
  const collateralStrc = collateralStrcRaw > 0 ? collateralStrcRaw : collateralWstrcRaw;
  const debtUsd = position ? parseFloat(formatBigInt(position.debtUsdc, 6, 2)) : 0;
  const loopedEquity = Math.max(0, collateralStrc * strcPrice - debtUsd);
  const leverage = position?.effectiveLeverage ?? 1;
  const hasLoopedPosition = positionData?.hasPosition && position !== null;

  // Values
  const unloopedUsd      = strcBalance.formatted     * strcPrice;
  const unloopedWstrcUsd = strcBalance.wstrcFormatted * strcPrice;
  const tbillUsd = tbillBalance * tbillPrice;
  const totalValue = usdcBalance + loopedEquity + unloopedUsd + unloopedWstrcUsd + tbillUsd + morphoSupplyUsd;

  // 24h P&L (STRC only — USDC and T-bill are stable)
  const looped24h = change24h !== null && position ? change24h * collateralStrc * leverage : 0;
  const unlooped24h = change24h !== null ? change24h * (strcBalance.formatted + strcBalance.wstrcFormatted) : 0;
  const total24h = looped24h + unlooped24h;
  const total24hPct = totalValue > 0 ? (total24h / (totalValue - total24h)) * 100 : 0;
  const is24hPositive = total24h >= 0;

  // Donut segments (only show non-zero)
  const segments: Segment[] = [
    { label: 'USDC',  value: usdcBalance,       color: ASSET_COLORS.usdc   },
    ...(hasLoopedPosition ? [{ label: 'Looped Position', value: loopedEquity, color: ASSET_COLORS.looped }] : []),
    { label: 'STRC',  value: unloopedUsd,        color: ASSET_COLORS.strc  },
    { label: 'wSTRC', value: unloopedWstrcUsd,   color: ASSET_COLORS.wstrc },
    { label: 'T-Bill',      value: tbillUsd,        color: ASSET_COLORS.tbill      },
    { label: 'USDC Lent',  value: morphoSupplyUsd, color: ASSET_COLORS.morphoLend },
  ].filter(s => s.value > 0.01);

  // Active positions count
  const activeCount = [usdcBalance > 0, hasLoopedPosition, unloopedUsd > 0, unloopedWstrcUsd > 0, tbillUsd > 0, morphoSupplyUsd > 0.01].filter(Boolean).length;

  const openDepositModal = () => document.dispatchEvent(new CustomEvent('open-deposit-modal'));

  const rows = [
    {
      key: 'usdc',
      label: 'USDC',
      sublabel: null,
      color: ASSET_COLORS.usdc,
      amount: usdcBalance,
      amountLabel: `${usdcBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDC`,
      value: usdcBalance as number | null,
      price: 1,
      change24h: null,
    },
    ...(hasLoopedPosition ? [{
      key: 'looped',
      label: 'Looped Position',
      sublabel: `${leverage.toFixed(1)}× leveraged STRCx`,
      color: ASSET_COLORS.looped,
      amount: collateralStrc,
      amountLabel: collateralStrc > 0 ? `${collateralStrc.toFixed(4)} STRCx` : `${collateralWstrcRaw.toFixed(4)} wSTRCx`,
      value: loopedEquity > 0 ? loopedEquity : null,
      price: strcPrice,
      change24h: changePct24h !== null ? changePct24h * leverage : null,
    }] : []),
    ...(strcBalance.formatted > 0.0001 ? [{
      key: 'strc',
      label: 'STRC',
      sublabel: 'Wallet balance',
      color: ASSET_COLORS.strc,
      amount: strcBalance.formatted,
      amountLabel: `${strcBalance.formatted.toFixed(4)} STRC`,
      value: unloopedUsd as number | null,
      price: strcPrice,
      change24h: changePct24h,
    }] : []),
    ...(strcBalance.wstrcFormatted > 0.0001 ? [{
      key: 'wstrc',
      label: 'wSTRC',
      sublabel: 'Wrapped STRC',
      color: ASSET_COLORS.wstrc,
      amount: strcBalance.wstrcFormatted,
      amountLabel: `${strcBalance.wstrcFormatted.toFixed(4)} wSTRC`,
      value: unloopedWstrcUsd as number | null,
      price: strcPrice,
      change24h: changePct24h,
    }] : []),
    ...(tbillBalance > 0.0001 ? [{
      key: 'tbill',
      label: 'T-Bill',
      sublabel: 'Invesco TBLL',
      color: ASSET_COLORS.tbill,
      amount: tbillBalance,
      amountLabel: `${tbillBalance.toFixed(4)} TBLL`,
      value: tbillUsd as number | null,
      price: tbillPrice,
      change24h: null,
    }] : []),
    ...(morphoSupplyUsd > 0.01 ? [{
      key: 'morpho-lend',
      label: 'USDC Lent',
      sublabel: 'Morpho market · earning yield',
      color: ASSET_COLORS.morphoLend,
      amount: morphoSupplyUsd,
      amountLabel: `${morphoSupplyUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`,
      value: morphoSupplyUsd as number | null,
      price: 1,
      change24h: null,
    }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6 items-start">

        {/* Left column */}
        <div className="space-y-6">

          {/* TTV hero */}
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
              Portfolio Total Value
            </p>
            {loading ? (
              <div className="flex items-center gap-4">
                <SpreadsSpinner size={32} />
              </div>
            ) : (
              <>
                <div className="text-5xl font-mono font-bold tracking-tight text-foreground">
                  {formatUsd(totalValue)}
                </div>
                <div className={cn('text-sm font-mono font-medium', is24hPositive ? 'text-success' : 'text-destructive')}>
                  24H {is24hPositive ? '+' : ''}${Math.abs(total24h).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                  <span className="text-xs font-normal opacity-80">
                    ({is24hPositive ? '+' : ''}{total24hPct.toFixed(2)}%)
                  </span>
                </div>
              </>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={openDepositModal}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
                DEPOSIT
              </button>
              <button
                onClick={() => document.dispatchEvent(new CustomEvent('open-withdraw-modal'))}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
                WITHDRAW
              </button>
            </div>
          </div>

          {/* Positions / Activity card */}
          <div className="rounded-lg border border-border bg-card">
            {/* Tab bar */}
            <div className="flex border-b border-border px-6 pt-4 shrink-0">
              <button
                onClick={() => setTab('positions')}
                className={cn(
                  'pb-3 px-1 mr-6 text-xs font-medium transition-colors border-b-2 flex items-center gap-1.5',
                  tab === 'positions' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                Positions
                {activeCount > 0 && (
                  <span className="text-[9px] font-mono bg-secondary border border-border rounded px-1 py-0.5">{activeCount}</span>
                )}
              </button>
              <button
                onClick={() => setTab('activity')}
                className={cn(
                  'pb-3 px-1 mr-6 text-xs font-medium transition-colors border-b-2',
                  tab === 'activity' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                Recent Activity
              </button>
              <div className="ml-auto pb-3 flex items-center">
                <span className="text-[10px] font-mono text-muted-foreground tracking-wide">
                  SESSION STATUS: <span className="text-success">REAL-TIME</span>
                </span>
              </div>
            </div>

            {/* Positions table */}
            {tab === 'positions' && (
              <div className="p-6">
                {loading ? (
                  <div className="flex items-center justify-center py-8"><SpreadsSpinner size={28} /></div>
                ) : rows.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">No assets yet.</p>
                    <button onClick={openDepositModal} className="mt-3 text-xs text-primary underline underline-offset-2">
                      Make a deposit to get started
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="pb-3 text-left font-medium tracking-widest uppercase text-[10px]">Asset</th>
                        <th className="pb-3 text-right font-medium tracking-widest uppercase text-[10px]">Amount</th>
                        <th className="pb-3 text-right font-medium tracking-widest uppercase text-[10px]">Value</th>
                        <th className="pb-3 text-right font-medium tracking-widest uppercase text-[10px]">Price</th>
                        <th className="pb-3 text-right font-medium tracking-widest uppercase text-[10px]">24h</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key} className="border-b border-border/40 last:border-0 hover:bg-secondary/20 transition-colors">
                          <td className="py-4 text-left">
                            <div className="flex items-center gap-2.5">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                              <div>
                                <div className="text-sm font-medium text-foreground">{row.label}</div>
                                {row.sublabel && <div className="text-[10px] text-muted-foreground font-mono">{row.sublabel}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 text-right font-mono text-sm text-muted-foreground">{row.amountLabel}</td>
                          <td className="py-4 text-right font-mono font-semibold">
                            {row.value !== null ? formatUsd(row.value) : <span className="text-muted-foreground text-xs">Updating...</span>}
                          </td>
                          <td className="py-4 text-right font-mono text-sm text-muted-foreground">{formatUsd(row.price)}</td>
                          <td className="py-4 text-right font-mono text-sm">
                            {row.change24h !== null ? (
                              <span className={row.change24h >= 0 ? 'text-success' : 'text-destructive'}>
                                {row.change24h >= 0 ? '+' : ''}{row.change24h.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === 'activity' && <RecentActivity />}
          </div>
        </div>

        {/* Right column — allocation */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-5">
          <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
            Allocation Distribution
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-12"><SpreadsSpinner size={32} /></div>
          ) : (
            <>
              <DonutChart segments={segments} total={totalValue} />
              <div className="space-y-2.5 pt-2 border-t border-border/50">
                {segments.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">No assets to display</p>
                ) : (
                  segments.map((seg) => (
                    <div key={seg.label} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                        <span className="text-muted-foreground font-mono">{seg.label}</span>
                      </div>
                      <span className="font-mono font-medium">
                        {totalValue > 0 ? ((seg.value / totalValue) * 100).toFixed(1) : '0.0'}%
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
