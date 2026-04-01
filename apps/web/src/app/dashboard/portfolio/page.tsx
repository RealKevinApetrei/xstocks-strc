'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { cn, formatUsd, formatBigInt } from '@/lib/utils';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { usePosition } from '@/hooks/use-position';
import { useStrcxPrice } from '@/hooks/use-strcx-price';
import { useStrcBalance } from '@/hooks/use-strc-balance';
import { useTbill } from '@/hooks/use-tbill';
import { api } from '@/lib/api';
import { SpreadsSpinner } from '@/components/shared/spreads-spinner';

const INK_EXPLORER = 'https://explorer.inkonchain.com';
function txUrl(hash: string) { return `${INK_EXPLORER}/tx/${hash}`; }
function shortHash(hash: string) { return hash ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : '—'; }

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

function DonutChart({ segments, total, centerLabel }: { segments: Segment[]; total: number; centerLabel?: string }) {
  const cx = 100; const cy = 100; const R = 82; const r = 58; const gap = 2;
  let cursor = 0;
  const arcs = segments.map((seg) => {
    const sweep = total > 0 ? (seg.value / total) * 360 : 0;
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
        <span className="text-[9px] font-mono text-muted-foreground tracking-widest uppercase">{centerLabel ?? 'Net Value'}</span>
        <span className="text-lg font-mono font-bold">{formatUsd(total)}</span>
      </div>
    </div>
  );
}

// ── Recent activity ──────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  COMPLETED: 'text-success bg-success/10 border-success/20',
  COMPLETED_PARTIAL: 'text-warning bg-warning/10 border-warning/20',
  FAILED: 'text-destructive bg-destructive/10 border-destructive/20',
  IN_PROGRESS: 'text-primary bg-primary/10 border-primary/20',
  PENDING: 'text-muted-foreground bg-muted/50 border-border',
};

const PAGE_SIZE = 10;

function RecentActivity() {
  const { getAccessToken } = usePrivy();
  const { data: posData } = usePosition();
  const [loops, setLoops] = useState<any[]>([]);
  const [gridEvents, setGridEvents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async (offset = 0) => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const [loopData, gridData] = await Promise.all([
        api.getLoopHistory(token, PAGE_SIZE, offset),
        posData?.gridStrategy?.id ? api.getGridEvents(token, posData.gridStrategy.id).catch(() => ({ events: [] })) : Promise.resolve({ events: [] }),
      ]);
      setLoops(loopData.loops);
      setGridEvents(gridData.events);
      setTotal(loopData.total + gridData.events.length);
    } catch {} finally { setLoading(false); }
  }, [getAccessToken, posData?.gridStrategy?.id]);

  useEffect(() => {
    setLoading(true);
    fetch_(page * PAGE_SIZE);
    const iv = setInterval(() => fetch_(page * PAGE_SIZE), 15_000);
    return () => clearInterval(iv);
  }, [fetch_, page]);

  if (loading) return <div className="flex items-center justify-center p-12"><SpreadsSpinner size={28} /></div>;

  // Merge loop and grid events into unified activity list
  type Activity = { id: string; type: string; date: string; amount: string; detail: string; status: string; txHash: string | null };
  const activities: Activity[] = [
    ...loops.map((l): Activity => ({
      id: l.id,
      type: 'Loop',
      date: l.createdAt,
      amount: formatUsd(parseFloat(l.strcAmount) / 1e6),
      detail: `${l.targetLeverage}× → ${l.effectiveLeverage ? `${l.effectiveLeverage.toFixed(1)}×` : '—'}`,
      status: l.status,
      txHash: l.txHash ?? null,
    })),
    ...gridEvents.map((e): Activity => ({
      id: e.id,
      type: 'DCA Buy',
      date: e.createdAt,
      amount: e.amountUsdc ? formatUsd(parseFloat(e.amountUsdc) / 1e6) : '—',
      detail: e.amountStrc ? `${(parseFloat(e.amountStrc) / 1e18).toFixed(2)} STRC` : `@ $${e.triggerPrice}`,
      status: e.status,
      txHash: e.cowOrderUid ?? null,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (activities.length === 0) return (
    <div className="p-8 text-center"><p className="text-sm text-muted-foreground">No activity yet.</p></div>
  );

  const totalPages = Math.max(1, Math.ceil(activities.length / PAGE_SIZE));
  const pageItems = activities.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="p-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] text-muted-foreground tracking-widest uppercase">
              <th className="py-2 text-left font-medium">Date</th>
              <th className="py-2 text-left font-medium">Type</th>
              <th className="py-2 text-right font-medium">Amount</th>
              <th className="py-2 text-right font-medium">Detail</th>
              <th className="py-2 text-right font-medium">Status</th>
              <th className="py-2 text-right font-medium">Tx</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((a) => (
              <tr key={a.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors">
                <td className="py-3 text-left font-mono text-xs">{new Date(a.date).toLocaleDateString()}</td>
                <td className="py-3 text-left text-xs">
                  <span className={cn(
                    'inline-block rounded px-1.5 py-0.5 text-[10px] font-mono border',
                    a.type === 'DCA Buy' ? 'text-orange-500 bg-orange-500/10 border-orange-500/20' : 'text-primary bg-primary/10 border-primary/20',
                  )}>{a.type}</span>
                </td>
                <td className="py-3 text-right font-mono text-xs">{a.amount}</td>
                <td className="py-3 text-right font-mono text-xs text-muted-foreground">{a.detail}</td>
                <td className="py-3 text-right">
                  <span className={cn('inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono', statusColors[a.status] ?? statusColors.PENDING)}>
                    {a.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="py-3 text-right font-mono text-[10px]">
                  {a.txHash ? (
                    <a href={txUrl(a.txHash)} target="_blank" rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground underline underline-offset-2">{shortHash(a.txHash)}</a>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-border/50 mt-4">
          <span className="text-[10px] text-muted-foreground font-mono">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, activities.length)} of {activities.length}
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
  usdc:      '#16a34a',
  looped:    '#1a3520',
  strc:      '#e05c00',
  wstrc:     '#b84500',
  tbill:     '#3b82f6',
  odVault:   '#f97316', // Orange Dot Vault
  lendVault: '#6366f1', // Lend USDC Vault
  debt:      '#dc2626', // Borrowed USDC (liability)
};

export default function Portfolio() {
  const [tab, setTab] = useState<'positions' | 'activity'>('positions');
  const { balance: usdcBalance, loading: usdcLoading } = useUsdcBalance();
  const { data: positionData, loading: posLoading } = usePosition();
  const { price: strcPrice, change24h, changePct24h } = useStrcxPrice();
  const strcBalance = useStrcBalance();
  const { balance: tbillBalance, price: tbillPrice, loading: tbillLoading } = useTbill();

  const loading = usdcLoading || posLoading || strcBalance.loading || tbillLoading;

  // Morpho position
  const position = positionData?.hasPosition ? positionData.position : null;
  const collateralStrcRaw = position ? parseFloat(formatBigInt(position.collateralStrc)) : 0;
  const collateralWstrcRaw = position ? parseFloat(formatBigInt(position.collateralWstrc ?? '0')) : 0;
  const collateralStrc = collateralStrcRaw > 0 ? collateralStrcRaw : collateralWstrcRaw;
  const debtUsd = position ? parseFloat(formatBigInt(position.debtUsdc, 6, 2)) : 0;
  const loopedEquity = Math.max(0, collateralStrc * strcPrice - debtUsd);
  const leverage = position?.effectiveLeverage ?? 1;
  const hasLoopedPosition = positionData?.hasPosition && position !== null;

  // Orange Dot Vault (Tydro)
  const odVaultUsd = positionData?.vaultBalance ? parseFloat(positionData.vaultBalance.assets) / 1e6 : 0;

  // Lend USDC Vault (Morpho supply)
  const lendVaultUsd = positionData?.lendBalance ? parseFloat(positionData.lendBalance.assets) / 1e6 : 0;

  // Other tokens
  const unloopedUsd = strcBalance.formatted * strcPrice;
  const unloopedWstrcUsd = strcBalance.wstrcFormatted * strcPrice;
  const tbillUsd = tbillBalance * tbillPrice;

  // Net value = assets - liabilities
  const totalAssets = usdcBalance + loopedEquity + unloopedUsd + unloopedWstrcUsd + tbillUsd + odVaultUsd + lendVaultUsd;
  const netValue = totalAssets; // loopedEquity already subtracts debt

  // 24h P&L
  const looped24h = change24h !== null && position ? change24h * collateralStrc * leverage : 0;
  const unlooped24h = change24h !== null ? change24h * (strcBalance.formatted + strcBalance.wstrcFormatted) : 0;
  const total24h = looped24h + unlooped24h;
  const total24hPct = netValue > 0 ? (total24h / (netValue - total24h)) * 100 : 0;
  const is24hPositive = total24h >= 0;

  // Donut segments (assets only, non-zero)
  const segments: Segment[] = [
    { label: 'USDC', value: usdcBalance, color: ASSET_COLORS.usdc },
    ...(odVaultUsd > 0.01 ? [{ label: 'Orange Dot', value: odVaultUsd, color: ASSET_COLORS.odVault }] : []),
    ...(lendVaultUsd > 0.01 ? [{ label: 'Lend USDC', value: lendVaultUsd, color: ASSET_COLORS.lendVault }] : []),
    ...(hasLoopedPosition ? [{ label: 'Looped', value: loopedEquity, color: ASSET_COLORS.looped }] : []),
    ...(unloopedUsd > 0.01 ? [{ label: 'STRC', value: unloopedUsd, color: ASSET_COLORS.strc }] : []),
    ...(unloopedWstrcUsd > 0.01 ? [{ label: 'wSTRC', value: unloopedWstrcUsd, color: ASSET_COLORS.wstrc }] : []),
    ...(tbillUsd > 0.01 ? [{ label: 'T-Bill', value: tbillUsd, color: ASSET_COLORS.tbill }] : []),
  ].filter(s => s.value > 0.01);

  const activeCount = segments.length;
  const openDepositModal = () => document.dispatchEvent(new CustomEvent('open-deposit-modal'));

  // Position rows
  const rows: Array<{
    key: string; label: string; sublabel: string | null; color: string;
    amount: number; amountLabel: string; value: number | null; price: number;
    change24h: number | null; isDebt?: boolean;
  }> = [
    {
      key: 'usdc', label: 'USDC', sublabel: 'Wallet', color: ASSET_COLORS.usdc,
      amount: usdcBalance, amountLabel: `${usdcBalance.toFixed(2)} USDC`,
      value: usdcBalance, price: 1, change24h: null,
    },
    ...(odVaultUsd > 0.01 ? [{
      key: 'odVault', label: 'Orange Dot Vault', sublabel: 'Tydro yield', color: ASSET_COLORS.odVault,
      amount: odVaultUsd, amountLabel: `${odVaultUsd.toFixed(2)} USDC`,
      value: odVaultUsd, price: 1, change24h: null,
    }] : []),
    ...(lendVaultUsd > 0.01 ? [{
      key: 'lendVault', label: 'Lend USDC Vault', sublabel: 'Morpho supply', color: ASSET_COLORS.lendVault,
      amount: lendVaultUsd, amountLabel: `${lendVaultUsd.toFixed(2)} USDC`,
      value: lendVaultUsd, price: 1, change24h: null,
    }] : []),
    ...(hasLoopedPosition ? [
      {
        key: 'looped', label: 'Looped wSTRC', sublabel: `${leverage.toFixed(1)}× collateral`, color: ASSET_COLORS.looped,
        amount: collateralStrc, amountLabel: `${collateralStrc.toFixed(4)} STRCx`,
        value: collateralStrc * strcPrice, price: strcPrice,
        change24h: changePct24h !== null ? changePct24h * leverage : null,
      },
      {
        key: 'debt', label: 'Borrowed USDC', sublabel: 'Morpho debt', color: ASSET_COLORS.debt,
        amount: debtUsd, amountLabel: `${debtUsd.toFixed(2)} USDC`,
        value: -debtUsd, price: 1, change24h: null, isDebt: true,
      },
    ] : []),
    ...(strcBalance.formatted > 0.0001 ? [{
      key: 'strc', label: 'STRC', sublabel: 'Wallet', color: ASSET_COLORS.strc,
      amount: strcBalance.formatted, amountLabel: `${strcBalance.formatted.toFixed(4)} STRC`,
      value: unloopedUsd, price: strcPrice, change24h: changePct24h,
    }] : []),
    ...(strcBalance.wstrcFormatted > 0.0001 ? [{
      key: 'wstrc', label: 'wSTRC', sublabel: 'Wallet', color: ASSET_COLORS.wstrc,
      amount: strcBalance.wstrcFormatted, amountLabel: `${strcBalance.wstrcFormatted.toFixed(4)} wSTRC`,
      value: unloopedWstrcUsd, price: strcPrice, change24h: changePct24h,
    }] : []),
    ...(tbillBalance > 0.0001 ? [{
      key: 'tbill', label: 'T-Bill', sublabel: 'TBLL', color: ASSET_COLORS.tbill,
      amount: tbillBalance, amountLabel: `${tbillBalance.toFixed(4)} TBLL`,
      value: tbillUsd, price: tbillPrice, change24h: null,
    }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6 items-start">
        {/* Left column */}
        <div className="space-y-6">
          {/* Net Portfolio Value */}
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
              Net Portfolio Value
            </p>
            {loading ? (
              <div className="flex items-center gap-4"><SpreadsSpinner size={32} /></div>
            ) : (
              <>
                <div className="text-5xl font-mono font-bold tracking-tight text-foreground">
                  {formatUsd(netValue)}
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
              <button onClick={openDepositModal}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
                DEPOSIT
              </button>
              <button onClick={() => document.dispatchEvent(new CustomEvent('open-withdraw-modal'))}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
                WITHDRAW
              </button>
            </div>
          </div>

          {/* Positions / Activity */}
          <div className="rounded-lg border border-border bg-card">
            <div className="flex border-b border-border px-6 pt-4 shrink-0">
              <button onClick={() => setTab('positions')}
                className={cn('pb-3 px-1 mr-6 text-xs font-medium transition-colors border-b-2 flex items-center gap-1.5',
                  tab === 'positions' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                Positions
                {activeCount > 0 && <span className="text-[9px] font-mono bg-secondary border border-border rounded px-1 py-0.5">{activeCount}</span>}
              </button>
              <button onClick={() => setTab('activity')}
                className={cn('pb-3 px-1 mr-6 text-xs font-medium transition-colors border-b-2',
                  tab === 'activity' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                Recent Activity
              </button>
              <div className="ml-auto" />
            </div>

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
                      <tr className="border-b border-border text-[10px] text-muted-foreground tracking-widest uppercase">
                        <th className="pb-3 text-left font-medium">Asset</th>
                        <th className="pb-3 text-right font-medium">Amount</th>
                        <th className="pb-3 text-right font-medium">Value</th>
                        <th className="pb-3 text-right font-medium">Price</th>
                        <th className="pb-3 text-right font-medium">24h</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key} className={cn('border-b border-border/40 last:border-0 hover:bg-secondary/20 transition-colors', row.isDebt && 'opacity-80')}>
                          <td className="py-4 text-left">
                            <div className="flex items-center gap-2.5">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                              <div>
                                <div className={cn('text-sm font-medium', row.isDebt ? 'text-destructive' : 'text-foreground')}>{row.label}</div>
                                {row.sublabel && <div className="text-[10px] text-muted-foreground font-mono">{row.sublabel}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 text-right font-mono text-sm text-muted-foreground">{row.amountLabel}</td>
                          <td className={cn('py-4 text-right font-mono font-semibold', row.isDebt && 'text-destructive')}>
                            {row.value !== null ? (row.isDebt ? `-${formatUsd(Math.abs(row.value))}` : formatUsd(row.value)) : '—'}
                          </td>
                          <td className="py-4 text-right font-mono text-sm text-muted-foreground">{formatUsd(row.price)}</td>
                          <td className="py-4 text-right font-mono text-sm">
                            {row.change24h !== null ? (
                              <span className={row.change24h >= 0 ? 'text-success' : 'text-destructive'}>
                                {row.change24h >= 0 ? '+' : ''}{row.change24h.toFixed(2)}%
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
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

        {/* Right column — allocation donut */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-5">
          <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
            Allocation
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-12"><SpreadsSpinner size={32} /></div>
          ) : (
            <>
              <DonutChart segments={segments} total={netValue} centerLabel="Net Value" />
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
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-muted-foreground">{formatUsd(seg.value)}</span>
                        <span className="font-mono font-medium w-12 text-right">
                          {netValue > 0 ? ((seg.value / netValue) * 100).toFixed(1) : '0.0'}%
                        </span>
                      </div>
                    </div>
                  ))
                )}
                {/* Net equity summary */}
                {hasLoopedPosition && debtUsd > 0 && (
                  <div className="pt-2 mt-2 border-t border-border/50 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-mono">Looped Equity</span>
                    <span className="font-mono font-medium">{formatUsd(loopedEquity)}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
