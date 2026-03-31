'use client';

import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';

const RANGE_DAYS: Record<TimeRange, number> = {
  '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': 365,
};

// Returns % return relative to day 0 (starts at 0%)
function generateData(days: number, aaveHistory?: Array<{ timestamp: string; supplyApy: number }>) {
  const data: Array<{ date: string; pct: number }> = [];
  const now = Date.now();
  let cumulative = 1;
  // 11.5% * 3x - 4.2% * 2x = 26.1% net APY for 3x loop
  const dailyRate = 26.1 / 365 / 100;

  for (let i = days; i >= 0; i--) {
    const date = new Date(now - i * 86400000);
    const noise = 1 + (Math.random() - 0.48) * 0.01;
    cumulative *= (1 + dailyRate) * noise;
    data.push({
      date: date.toISOString().split('T')[0],
      pct: (cumulative - 1) * 100,
    });
  }
  return data;
}

function formatDateLabel(dateStr: string, range: TimeRange): string {
  const d = new Date(dateStr);
  if (range === '1M') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function PerformanceChart({ embedded = false }: { embedded?: boolean }) {
  const [range, setRange] = useState<TimeRange>('3M');
  const [aaveHistory, setAaveHistory] = useState<Array<{ timestamp: string; supplyApy: number }>>([]);

  useEffect(() => {
    api.getAaveYield(RANGE_DAYS[range]).then((result) => {
      setAaveHistory(result.history);
    }).catch(() => {});
  }, [range]);

  const data = useMemo(() => generateData(RANGE_DAYS[range], aaveHistory), [range, aaveHistory]);

  const width = 800;
  const height = 260;
  const pad = { top: 20, right: 20, bottom: 40, left: 52 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const minPct = Math.min(...data.map(d => d.pct));
  const maxPct = Math.max(...data.map(d => d.pct));
  const padY = (maxPct - minPct) * 0.1 || 1;
  const domainMin = minPct - padY;
  const domainMax = maxPct + padY;

  const toX = (i: number) => pad.left + (i / (data.length - 1)) * chartW;
  const toY = (v: number) => pad.top + chartH - ((v - domainMin) / (domainMax - domainMin)) * chartH;

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(d.pct).toFixed(1)}`).join(' ');

  // Y-axis ticks: nice round % values
  const step = Math.ceil((domainMax - domainMin) / 4);
  const yStart = Math.floor(domainMin / step) * step;
  const yTicks = Array.from({ length: 6 }, (_, i) => yStart + i * step).filter(v => v >= domainMin && v <= domainMax);

  // X-axis: 5–6 evenly spaced
  const xCount = 5;
  const xIndices = Array.from({ length: xCount }, (_, i) => Math.round((i / (xCount - 1)) * (data.length - 1)));

  const lastPct = data[data.length - 1].pct;

  return (
    <div className={cn(embedded ? 'p-6 space-y-4' : 'rounded-lg border border-border bg-card p-6 space-y-4')}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <span className="inline-block w-4 h-px bg-foreground" />
          STRC 3× Loop
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

      {/* SVG chart */}
      <div className="w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" style={{ display: 'block' }}>
          {/* Horizontal grid lines + Y labels */}
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={pad.left} y1={toY(v)}
                x2={width - pad.right} y2={toY(v)}
                stroke="rgba(0,0,0,0.07)"
                strokeWidth="1"
              />
              <text
                x={pad.left - 8}
                y={toY(v) + 4}
                textAnchor="end"
                fill="#9ca3af"
                fontSize="10"
                fontFamily="'IBM Plex Mono', monospace"
              >
                {v >= 0 ? '+' : ''}{v}%
              </text>
            </g>
          ))}

          {/* X-axis date labels */}
          {xIndices.map((idx) => (
            <text
              key={idx}
              x={toX(idx)}
              y={pad.top + chartH + 24}
              textAnchor="middle"
              fill="#9ca3af"
              fontSize="10"
              fontFamily="'IBM Plex Mono', monospace"
            >
              {formatDateLabel(data[idx].date, range)}
            </text>
          ))}

          {/* Main line */}
          <path d={linePath} fill="none" stroke="#0a0a0a" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />

          {/* End dot */}
          <circle cx={toX(data.length - 1)} cy={toY(lastPct)} r="3" fill="#0a0a0a" />
        </svg>
      </div>

      <p className="text-[9px] text-muted-foreground">
        Simulated · STRC 3× loop at 11.5% dividend yield minus Morpho borrow cost. Past performance does not guarantee future results.
      </p>
    </div>
  );
}
