'use client';

import { useState, useMemo, useEffect } from 'react';
import { cn, formatUsd } from '@/lib/utils';
import { api } from '@/lib/api';
import { useStrcxPrice } from '@/hooks/use-strcx-price';
import { useMarketRate } from '@/hooks/use-market-rate';

type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';

const STRC_BASE_APY = 11.5;
const LEVERAGE = 3;

function buildPerformanceData(
  days: number,
  strcPrices: Array<{ price: number; timestamp: number }>,
  aaveHistory: Array<{ timestamp: string; supplyApy: number }>,
  borrowRate: number,
) {
  const data: Array<{ date: string; strcLoopYield: number; aaveUsdcYield: number }> = [];
  if (strcPrices.length === 0) return data;

  const netDailyRate = (STRC_BASE_APY * LEVERAGE - borrowRate * (LEVERAGE - 1)) / 365 / 100;
  const basePrice = strcPrices[0].price;
  let aaveCumulative = 100;

  for (let i = 0; i < strcPrices.length; i++) {
    const p = strcPrices[i];
    const dateStr = new Date(p.timestamp * 1000).toISOString().split('T')[0];

    const priceReturn = (p.price - basePrice) / basePrice;
    const leveragedPriceReturn = priceReturn * LEVERAGE;
    const yieldAccrued = netDailyRate * i;
    const strcLoopYield = 100 * (1 + leveragedPriceReturn + yieldAccrued);

    const aaveRate = aaveHistory[i]
      ? aaveHistory[i].supplyApy / 365 / 100
      : 2.5 / 365 / 100;
    aaveCumulative *= (1 + aaveRate);

    data.push({ date: dateStr, strcLoopYield, aaveUsdcYield: aaveCumulative });
  }

  return data;
}

const RANGE_DAYS: Record<TimeRange, number> = {
  '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': 365,
};

function formatDateLabel(dateStr: string, range: TimeRange): string {
  const d = new Date(dateStr);
  if (range === '1M') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function ChartSkeleton({ embedded }: { embedded: boolean }) {
  return (
    <div className={cn(embedded ? 'p-6' : 'rounded-lg border border-border bg-card p-6')}>
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-48 bg-secondary animate-pulse rounded" />
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-6 w-8 bg-secondary animate-pulse rounded" />
          ))}
        </div>
      </div>
      <div className="h-[240px] flex flex-col justify-end gap-1 px-12">
        {[60, 45, 70, 35, 55, 40, 65].map((h, i) => (
          <div key={i} className="w-full bg-secondary animate-pulse rounded" style={{ height: `${h}%`, opacity: 0.3 + i * 0.1 }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4 pt-4 mt-4 border-t border-border">
        {[1, 2, 3].map((i) => (
          <div key={i}>
            <div className="h-3 w-16 bg-secondary animate-pulse rounded mb-1" />
            <div className="h-5 w-12 bg-secondary animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PerformanceChart({ embedded = false }: { embedded?: boolean }) {
  const [range, setRange] = useState<TimeRange>('3M');
  const [aaveHistory, setAaveHistory] = useState<Array<{ timestamp: string; supplyApy: number }>>([]);
  const [aaveCurrentApy, setAaveCurrentApy] = useState<number>(2.5);
  const [strcPrices, setStrcPrices] = useState<Array<{ price: number; timestamp: number }>>([]);
  const [loading, setLoading] = useState(true);
  const { price: currentPrice } = useStrcxPrice();
  const { borrowApy, loading: rateLoading } = useMarketRate();

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getAaveYield(RANGE_DAYS[range]).catch(() => ({ currentSupplyApy: 2.5, history: [] as Array<{ timestamp: string; supplyApy: number }> })),
      api.getStrcPriceHistory(RANGE_DAYS[range]).catch(() => ({ history: [] as Array<{ price: number; timestamp: number }> })),
    ]).then(([aaveData, strcData]) => {
      setAaveHistory(aaveData.history);
      setAaveCurrentApy(aaveData.currentSupplyApy);
      setStrcPrices(strcData.history);
      setLoading(false);
    });
  }, [range]);

  const effectiveRate = borrowApy ?? 0;

  const data = useMemo(
    () => buildPerformanceData(RANGE_DAYS[range], strcPrices, aaveHistory, effectiveRate),
    [range, strcPrices, aaveHistory, effectiveRate],
  );

  if (loading || rateLoading || data.length === 0) {
    return <ChartSkeleton embedded={embedded} />;
  }

  const lastPoint = data[data.length - 1];
  const strcReturn = ((lastPoint.strcLoopYield - 100) / 100) * 100;
  const aaveReturn = ((lastPoint.aaveUsdcYield - 100) / 100) * 100;
  const outperformance = strcReturn - aaveReturn;

  const strcPcts = data.map(d => ((d.strcLoopYield - 100) / 100) * 100);
  const aavePcts = data.map(d => ((d.aaveUsdcYield - 100) / 100) * 100);

  const width = 800;
  const height = 260;
  const pad = { top: 20, right: 20, bottom: 40, left: 52 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const allPcts = [...strcPcts, ...aavePcts];
  const domainMin = Math.min(...allPcts) - 1;
  const domainMax = Math.max(...allPcts) + 1;

  const toX = (i: number) => pad.left + (i / (data.length - 1)) * chartW;
  const toY = (v: number) => pad.top + chartH - ((v - domainMin) / (domainMax - domainMin)) * chartH;

  const strcPath = strcPcts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');
  const aavePath = aavePcts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');

  const rangeStep = Math.ceil((domainMax - domainMin) / 4);
  const yStart = Math.floor(domainMin / rangeStep) * rangeStep;
  const yTicks = Array.from({ length: 7 }, (_, i) => yStart + i * rangeStep).filter(v => v >= domainMin && v <= domainMax);
  const xIndices = Array.from({ length: 5 }, (_, i) => Math.round((i / 4) * (data.length - 1)));

  return (
    <div className={cn(embedded ? 'p-6 space-y-4' : 'rounded-lg border border-border bg-card p-6 space-y-4')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="inline-block w-4 h-px bg-foreground" />
            STRC {LEVERAGE}× Loop
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="inline-block w-4 h-px bg-muted-foreground/40" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#9ca3af,#9ca3af 3px,transparent 3px,transparent 6px)' }} />
            Aave USDC ({aaveCurrentApy.toFixed(1)}%)
          </div>
          {currentPrice > 0 && (
            <span className="text-foreground font-medium">STRC {formatUsd(currentPrice)}</span>
          )}
        </div>
        <div className="flex gap-1">
          {(['1M', '3M', '6M', '1Y', 'ALL'] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                'px-2.5 py-1 rounded-md text-[10px] font-mono font-medium transition-colors border',
                range === r
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/30',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" style={{ display: 'block' }}>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={pad.left} y1={toY(v)} x2={width - pad.right} y2={toY(v)} stroke="rgba(0,0,0,0.07)" strokeWidth="1" />
              <text x={pad.left - 8} y={toY(v) + 4} textAnchor="end" fill="#9ca3af" fontSize="10" fontFamily="'IBM Plex Mono',monospace">
                {v >= 0 ? '+' : ''}{v}%
              </text>
            </g>
          ))}
          {xIndices.map((idx) => (
            <text key={idx} x={toX(idx)} y={pad.top + chartH + 24} textAnchor="middle" fill="#9ca3af" fontSize="10" fontFamily="'IBM Plex Mono',monospace">
              {formatDateLabel(data[idx].date, range)}
            </text>
          ))}
          <path d={aavePath} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="1.2" strokeDasharray="4,3" />
          <path d={strcPath} fill="none" stroke="#0a0a0a" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={toX(data.length - 1)} cy={toY(strcPcts[strcPcts.length - 1])} r="3" fill="#0a0a0a" />
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border">
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">STRC {LEVERAGE}× Loop</div>
          <div className={cn('text-sm font-mono font-semibold', strcReturn >= 0 ? 'text-success' : 'text-destructive')}>
            {strcReturn >= 0 ? '+' : ''}{strcReturn.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">Aave USDC</div>
          <div className="text-sm font-mono font-semibold text-muted-foreground">+{aaveReturn.toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">Outperformance</div>
          <div className={cn('text-sm font-mono font-semibold', outperformance > 0 ? 'text-success' : 'text-destructive')}>
            {outperformance > 0 ? '+' : ''}{outperformance.toFixed(1)}%
          </div>
        </div>
      </div>

      <p className="text-[9px] text-muted-foreground">
        Pyth Network · DeFi Llama · {LEVERAGE}× STRC loop at {STRC_BASE_APY}% yield minus {effectiveRate.toFixed(1)}% Morpho borrow. Past performance does not guarantee future results.
      </p>
    </div>
  );
}
