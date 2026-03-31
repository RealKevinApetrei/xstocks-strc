'use client';

import { cn, formatUsd } from '@/lib/utils';
import { useStrcxPrice } from '@/hooks/use-strcx-price';

function MiniSparkline({ data }: { data: Array<{ price: number }> }) {
  if (data.length < 2) return null;

  const prices = data.map(d => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const w = 120;
  const h = 28;
  const step = w / (prices.length - 1);

  const points = prices.map((p, i) => `${i * step},${h - ((p - min) / range) * h}`);
  const path = `M ${points.join(' L ')}`;

  const isUp = prices[prices.length - 1] >= prices[0];

  return (
    <svg width={w} height={h} className="overflow-visible">
      <path
        d={path}
        fill="none"
        stroke={isUp ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={w}
        cy={h - ((prices[prices.length - 1] - min) / range) * h}
        r="2"
        fill={isUp ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'}
      >
        <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export function LivePriceTicker() {
  const { price, changePct24h, change24h, stale, source, history } = useStrcxPrice();

  const isPositive = (changePct24h ?? 0) >= 0;
  const isLive = !stale && source !== 'fallback';

  // Downsample history for sparkline (last ~60 points)
  const sparkData = history.length > 60
    ? history.filter((_, i) => i % Math.ceil(history.length / 60) === 0)
    : history;

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-3">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
          )}
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            STRC/USD
          </span>
        </div>
        <span className="text-2xl font-mono font-bold tracking-tight">
          {formatUsd(price)}
        </span>
        {changePct24h !== null && (
          <div className={cn('flex items-center gap-1 text-sm font-mono', isPositive ? 'text-success' : 'text-destructive')}>
            <span>{isPositive ? '+' : ''}{change24h !== null ? formatUsd(change24h) : ''}</span>
            <span className="text-xs">({isPositive ? '+' : ''}{changePct24h.toFixed(2)}%)</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <MiniSparkline data={sparkData} />
        <span className="text-[9px] font-mono text-muted-foreground">
          {isLive ? 'Pyth Network' : 'offline'}
        </span>
      </div>
    </div>
  );
}
