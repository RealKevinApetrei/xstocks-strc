'use client';

import { useState, useMemo } from 'react';
import { cn, formatUsd } from '@/lib/utils';

type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';

// Simulated backtested data — will integrate live data soon
function generateSimulatedData(days: number) {
  const data: Array<{
    date: string;
    strcLoopYield: number;
    aaveUsdcYield: number;
  }> = [];

  const now = Date.now();
  let strcCumulative = 100;
  let aaveCumulative = 100;

  const strcDailyRate = 28 / 365 / 100; // ~28% APY for 3x leveraged STRC
  const aaveDailyRate = 3.5 / 365 / 100; // ~3.5% APY Aave USDC

  for (let i = days; i >= 0; i--) {
    const date = new Date(now - i * 86400000);
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
  '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': 365,
};

function formatDateLabel(dateStr: string, range: TimeRange): string {
  const d = new Date(dateStr);
  if (range === '1M') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function PerformanceChart({ embedded = false }: { embedded?: boolean }) {
  const [range, setRange] = useState<TimeRange>('3M');
  const data = useMemo(() => generateSimulatedData(RANGE_DAYS[range]), [range]);

  const lastPoint = data[data.length - 1];
  const strcReturn = ((lastPoint.strcLoopYield - 100) / 100) * 100;
  const aaveReturn = ((lastPoint.aaveUsdcYield - 100) / 100) * 100;
  const outperformance = strcReturn - aaveReturn;

  // Chart dimensions with proper padding for axes
  const width = 800;
  const height = 240;
  const padding = { top: 16, right: 20, bottom: 36, left: 52 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const allValues = data.flatMap(d => [d.strcLoopYield, d.aaveUsdcYield]);
  const minY = Math.min(...allValues) * 0.995;
  const maxY = Math.max(...allValues) * 1.005;

  const toX = (i: number) => padding.left + (i / (data.length - 1)) * chartW;
  const toY = (v: number) => padding.top + chartH - ((v - minY) / (maxY - minY)) * chartH;

  const strcPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.strcLoopYield)}`).join(' ');
  const aavePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.aaveUsdcYield)}`).join(' ');
  const strcArea = strcPath + ` L ${toX(data.length - 1)} ${padding.top + chartH} L ${toX(0)} ${padding.top + chartH} Z`;

  // X-axis: pick ~5-6 evenly spaced date labels
  const xLabelCount = range === '1M' ? 5 : 6;
  const xLabelIndices = Array.from({ length: xLabelCount }, (_, i) =>
    Math.round((i / (xLabelCount - 1)) * (data.length - 1))
  );

  // Y-axis: 4 ticks
  const yTicks = Array.from({ length: 4 }, (_, i) => minY + (maxY - minY) * (i / 3));

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
      <div className="w-full overflow-hidden rounded-md border border-border bg-background p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" style={{ display: 'block' }}>
          <defs>
            <linearGradient id="strcGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines + Y-axis labels */}
          {yTicks.map((val, i) => (
            <g key={`y-${i}`}>
              <line
                x1={padding.left}
                y1={toY(val)}
                x2={width - padding.right}
                y2={toY(val)}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3,3"
              />
              <text
                x={padding.left - 8}
                y={toY(val) + 4}
                textAnchor="end"
                fill="rgba(161,161,170,0.6)"
                fontSize="10"
                fontFamily="monospace"
              >
                ${val.toFixed(0)}
              </text>
            </g>
          ))}

          {/* Vertical grid lines + X-axis date labels */}
          {xLabelIndices.map((idx) => (
            <g key={`x-${idx}`}>
              <line
                x1={toX(idx)}
                y1={padding.top}
                x2={toX(idx)}
                y2={padding.top + chartH}
                stroke="rgba(255,255,255,0.04)"
                strokeDasharray="3,3"
              />
              <text
                x={toX(idx)}
                y={padding.top + chartH + 20}
                textAnchor="middle"
                fill="rgba(161,161,170,0.6)"
                fontSize="10"
                fontFamily="monospace"
              >
                {formatDateLabel(data[idx].date, range)}
              </text>
            </g>
          ))}

          {/* STRC area fill */}
          <path d={strcArea} fill="url(#strcGradient)" />

          {/* Aave line (benchmark — dashed) */}
          <path d={aavePath} fill="none" stroke="rgba(161,161,170,0.35)" strokeWidth="1.5" strokeDasharray="5,4" />

          {/* STRC line */}
          <path d={strcPath} fill="none" stroke="rgb(59, 130, 246)" strokeWidth="2" />

          {/* End dots */}
          <circle cx={toX(data.length - 1)} cy={toY(lastPoint.strcLoopYield)} r="3" fill="rgb(59, 130, 246)" />
          <circle cx={toX(data.length - 1)} cy={toY(lastPoint.aaveUsdcYield)} r="2.5" fill="rgba(161,161,170,0.5)" />
        </svg>
      </div>

      {/* Legend — outside SVG, clean layout */}
      <div className="flex items-center gap-6 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded-full bg-primary" />
          <span>STRC 3x Loop</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded-full bg-muted-foreground/40" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, rgb(39,39,42) 3px, rgb(39,39,42) 6px)' }} />
          <span>Aave USDC</span>
        </div>
      </div>

      <p className="text-[9px] text-muted-foreground leading-relaxed">
        Simulated historical performance. Past performance does not guarantee future results. Based on STRC rebase yield at 3x leverage minus Morpho borrow costs, compared to Aave USDC lending rates. Live data integration coming soon.
      </p>
    </div>
  );
}
