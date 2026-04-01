'use client';

import { cn, formatUsd, formatBigInt } from '@/lib/utils';
import { usePosition } from '@/hooks/use-position';
import { useStrcxPrice } from '@/hooks/use-strcx-price';

export function AccountOverview() {
  const { data: positionData, loading } = usePosition();
  const { price: strcPrice, changePct24h } = useStrcxPrice();

  if (loading) {
    return (
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
          Account
        </div>
        <div className="h-8 bg-muted rounded animate-pulse w-32" />
      </div>
    );
  }

  // Calculate TTV from position: collateral value - debt
  let ttv = 0;
  if (positionData?.hasPosition && positionData.position) {
    const collateralStrc = parseFloat(formatBigInt(positionData.position.collateralStrc));
    const debtUsd = parseFloat(formatBigInt(positionData.position.debtUsdc, 6, 2));
    ttv = collateralStrc * strcPrice - debtUsd;
  }

  const isPositive = (changePct24h ?? 0) >= 0;
  // Estimate 24h USD change from price change percentage applied to equity
  const change24hUsd = changePct24h !== null ? ttv * (changePct24h / 100) : 0;

  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
        Equity
      </div>
      <div className="text-2xl font-mono font-bold tracking-tight">
        {ttv > 0 ? formatUsd(ttv) : '—'}
      </div>
      {changePct24h !== null && ttv > 0 ? (
        <div className={cn('text-[10px] font-mono mt-1', isPositive ? 'text-success' : 'text-destructive')}>
          24H {isPositive ? '+' : ''}{formatUsd(change24hUsd)} ({isPositive ? '+' : ''}{changePct24h.toFixed(1)}%)
        </div>
      ) : (
        <div className="text-[10px] font-mono mt-1 text-muted-foreground">—</div>
      )}
    </div>
  );
}
