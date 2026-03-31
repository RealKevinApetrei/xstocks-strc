'use client';

import { useEffect, useRef, useState } from 'react';
import { cn, formatBigInt } from '@/lib/utils';
import { usePosition } from '@/hooks/use-position';
import { useStrcxPrice } from '@/hooks/use-strcx-price';

const STRC_BASE_APY = 11.5;
const MORPHO_BORROW_RATE = 4.2;

function useCountUp(target: number, duration = 1800, decimals = 0) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const prevTarget = useRef(0);

  useEffect(() => {
    if (target === prevTarget.current) return;
    prevTarget.current = target;

    const from = value;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(parseFloat((from + eased * (target - from)).toFixed(decimals)));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration, decimals]);

  return value;
}

export function DepositsHero() {
  const { data: positionData, loading } = usePosition();
  const { price: strcPrice, change24h, changePct24h } = useStrcxPrice();

  // Derive real values from position
  const position = positionData?.position;
  const hasPosition = positionData?.hasPosition && position;

  const collateralStrc = hasPosition ? parseFloat(formatBigInt(position.collateralStrc)) : 0;
  const collateralUsd = collateralStrc * strcPrice;
  const debtUsd = hasPosition ? parseFloat(formatBigInt(position.debtUsdc, 6, 2)) : 0;
  const equityUsd = collateralUsd - debtUsd;
  const leverage = hasPosition ? position.effectiveLeverage : 0;
  const netApy = leverage > 0
    ? STRC_BASE_APY * leverage - MORPHO_BORROW_RATE * (leverage - 1)
    : 0;

  // 24h P&L on equity from price movement
  const change24hUsd = (change24h !== null && collateralStrc > 0)
    ? change24h * collateralStrc * leverage
    : null;
  const change24hPct = changePct24h !== null ? changePct24h * leverage : null;

  const displayDeposits = useCountUp(equityUsd, 1600, 2);
  const displayApy = useCountUp(netApy, 1400, 1);

  const isPositive = (change24hUsd ?? 0) >= 0;

  if (loading) {
    return (
      <div className="flex items-end justify-between py-2 animate-pulse">
        <div>
          <div className="h-2.5 w-24 bg-muted rounded mb-3" />
          <div className="h-12 w-48 bg-muted rounded" />
        </div>
        <div className="h-10 w-32 bg-muted rounded" />
      </div>
    );
  }

  if (!hasPosition) {
    return (
      <div className="flex items-end justify-between py-2">
        <div>
          <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-2">
            Your Deposits
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-5xl font-mono font-bold tracking-tight text-foreground">$0</span>
            <span className="text-sm font-mono text-muted-foreground">.00</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground font-mono pb-1">No active position</p>
      </div>
    );
  }

  return (
    <div className="flex items-end justify-between py-2">
      <div className="flex items-end gap-10">
        <div>
          <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-2">
            Your Deposits
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-5xl font-mono font-bold tracking-tight text-foreground">
              ${displayDeposits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-2">
            Net APY
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-5xl font-mono font-bold tracking-tight text-success">
              +{displayApy.toFixed(1)}
            </span>
            <span className="text-xl font-mono font-semibold text-success/70">%</span>
          </div>
        </div>
      </div>

      {change24hUsd !== null && (
        <div className={cn(
          'text-right text-sm font-mono font-semibold pb-1',
          isPositive ? 'text-success' : 'text-destructive'
        )}>
          <div>
            {isPositive ? '+' : ''}${Math.abs(change24hUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })} today
          </div>
          <div className="text-xs font-normal text-muted-foreground mt-0.5">
            {change24hPct !== null && `${isPositive ? '+' : ''}${(change24hPct).toFixed(2)}% 24h`}
          </div>
        </div>
      )}
    </div>
  );
}
