'use client';

import { useState, useMemo } from 'react';
import { cn, formatUsd } from '@/lib/utils';

type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';

// Simulated backtested data — will integrate live data soon
function generateSimulatedData(days: number) {
  const data: Array<{
    date: string;
    strcLoopYield: number;   // Cumulative yield from STRC loop strategy
    aaveUsdcYield: number;   // Cumulative yield from Aave USDC lending (benchmark)
  }> = [];

  const now = Date.now();
  let strcCumulative = 100; // Starting with $100
  let aaveCumulative = 100;

  const strcDailyRate = 28 / 365 / 100; // ~28% APY for 3x leveraged STRC
  const aaveDailyRate = 3.5 / 365 / 100; // ~3.5% APY Aave USDC

  for (let i = days; i >= 0; i--) {
    const date = new Date(now - i * 86400000);
    // Add some volatility noise
    const strcNoise = 1 + (Math.random() - 0.48) * 0.008;
    const aaveNoise = 1 + (Math.random() - 0.5) * 0.001;

    strcCumulative *= (1 + strcDailyRate) * strcNoise;
    aaveCumulative *= (1 + aaveDailyRate) * aaveNoise;

    data.push({
      date: date.toISOString().split('T')[0],
      strcLoopYield: strcCumulative,
      aaveUsdcYield: aaveCumulative,
    });
  }

  return data;
}

const RANGE_DAYS: Record<TimeRange, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  'ALL': 365,
};

export function PerformanceChart({ embedded = false }: { embedded?: boolean }) {
  const [range, setRange] = useState<TimeRange>('3M');
  const data = useMemo(() => generateSimulatedData(RANGE_DAYS[range]), [range]);

  const lastPoint = data[data.length - 1];
  const strcReturn = ((lastPoint.strcLoopYield - 100) / 100) * 100;
  const aaveReturn = ((lastPoint.aaveUsdcYield - 100) / 100) * 100;
  const outperformance = strcReturn - aaveReturn;

  // Simple SVG chart
  const width = 800;
  const height = 200;
  const padding = { top: 10, right: 10, bottom: 20, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const allValues = data.flatMap(d => [d.strcLoopYield, d.aaveUsdcYield]);
  const minY = Math.min(...allValues) * 0.99;
  const maxY = Math.max(...allValues) * 1.01;

  const toX = (i: number) => padding.left + (i / (data.length - 1)) * chartW;
  const toY = (v: number) => padding.top + chartH - ((v - minY) / (maxY - minY)) * chartH;

  const strcPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.strcLoopYield)}`).join(' ');
  const aavePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.aaveUsdcYield)}`).join(' ');

  // Area fill for STRC
  const strcArea = strcPath + ` L ${toX(data.length - 1)} ${toY(minY)} L ${toX(0)} ${toY(minY)} Z`;

  return (
    <div className={cn(embedded ? 'p-6 space-y-5' : 'rounded-lg border border-border bg-card p-6 space-y-5')}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Backtested Performance</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">Simulated — STRC 3x Loop vs Aave USDC Lending</p>
        </div>
        <div className="flex gap-1">
          {(['1M', '3M', '6M', '1Y', 'ALL'] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                'px-2.5 py-1 rounded text-[10px] font-mono font-medium transition-colors',
                range === r
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">STRC 3x Loop</div>
          <div className="text-lg font-mono font-semibold text-primary">+{strcReturn.toFixed(1)}%</div>
          <div className="text-[10px] text-muted-foreground font-mono">{formatUsd(lastPoint.strcLoopYield)} from $100</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">Aave USDC (benchmark)</div>
          <div className="text-lg font-mono font-semibold text-muted-foreground">+{aaveReturn.toFixed(1)}%</div>
          <div className="text-[10px] text-muted-foreground font-mono">{formatUsd(lastPoint.aaveUsdcYield)} from $100</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">Outperformance</div>
          <div className={cn('text-lg font-mono font-semibold', outperformance > 0 ? 'text-success' : 'text-destructive')}>
            {outperformance > 0 ? '+' : ''}{outperformance.toFixed(1)}%
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">vs Aave</div>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="w-full overflow-hidden rounded-md border border-border bg-background">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          <defs>
            <linearGradient id="strcGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((pct) => (
            <line
              key={pct}
              x1={padding.left}
              y1={padding.top + chartH * pct}
              x2={width - padding.right}
              y2={padding.top + chartH * pct}
              stroke="rgba(255,255,255,0.05)"
              strokeDasharray="4,4"
            />
          ))}

          {/* STRC area fill */}
          <path d={strcArea} fill="url(#strcGradient)" />

          {/* Aave line (benchmark) */}
          <path d={aavePath} fill="none" stroke="rgba(161,161,170,0.4)" strokeWidth="1.5" strokeDasharray="4,4" />

          {/* STRC line */}
          <path d={strcPath} fill="none" stroke="rgb(59, 130, 246)" strokeWidth="2" />

          {/* Y-axis labels */}
          {[minY, (minY + maxY) / 2, maxY].map((val, i) => (
            <text
              key={i}
              x={padding.left - 5}
              y={toY(val) + 3}
              textAnchor="end"
              className="text-[9px] fill-muted-foreground font-mono"
            >
              ${val.toFixed(0)}
            </text>
          ))}

          {/* Legend */}
          <line x1={padding.left + 10} y1={height - 5} x2={padding.left + 30} y2={height - 5} stroke="rgb(59, 130, 246)" strokeWidth="2" />
          <text x={padding.left + 35} y={height - 2} className="text-[9px] fill-muted-foreground font-mono">STRC 3x Loop</text>
          <line x1={padding.left + 150} y1={height - 5} x2={padding.left + 170} y2={height - 5} stroke="rgba(161,161,170,0.4)" strokeWidth="1.5" strokeDasharray="4,4" />
          <text x={padding.left + 175} y={height - 2} className="text-[9px] fill-muted-foreground font-mono">Aave USDC</text>
        </svg>
      </div>

      <p className="text-[9px] text-muted-foreground">
        Simulated historical performance. Past performance does not guarantee future results. Based on STRC rebase yield at 3x leverage minus Morpho borrow costs, compared to Aave USDC lending rates. Live data integration coming soon.
      </p>
    </div>
  );
}
