'use client';

import { cn, formatBigInt, formatUsd } from '@/lib/utils';
import { usePosition } from '@/hooks/use-position';
import { useStrcxPrice } from '@/hooks/use-strcx-price';

const MORPHO_BORROW_RATE_APY = 4.2;
const STRC_STAKING_APY = 12.5;

function HealthFactorGauge({ hf }: { hf: number }) {
  const percentage = Math.min(Math.max((hf - 1) / 2, 0), 1) * 100;
  const color = hf > 2 ? 'text-success' : hf > 1.5 ? 'text-warning' : 'text-destructive';
  const barColor = hf > 2 ? 'bg-success' : hf > 1.5 ? 'bg-warning' : 'bg-destructive';
  const glowColor = hf > 2 ? 'shadow-success/30' : hf > 1.5 ? 'shadow-warning/30' : 'shadow-destructive/30';
  const label = hf > 2 ? 'SAFE' : hf > 1.5 ? 'CAUTION' : 'DANGER';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Health Factor</span>
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-mono font-semibold uppercase tracking-wider', color)}>{label}</span>
          <span className={cn('text-lg font-mono font-bold', color)}>{hf.toFixed(2)}</span>
        </div>
      </div>
      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('absolute left-0 top-0 h-full rounded-full transition-all duration-500 shadow-md', barColor, glowColor)}
          style={{ width: `${percentage}%` }}
        />
        <div className="absolute top-0 h-full w-px bg-warning/50" style={{ left: '25%' }} />
        <div className="absolute top-0 h-full w-px bg-success/50" style={{ left: '50%' }} />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
        <span>1.0 LIQ</span>
        <span>1.5</span>
        <span>2.0</span>
        <span>3.0+</span>
      </div>
    </div>
  );
}

export function PositionCard() {
  const { data: positionData, loading } = usePosition();
  const { price: strcPrice, stale, source } = useStrcxPrice();

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-24 mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded" />)}
        </div>
      </div>
    );
  }

  if (!positionData?.hasPosition || !positionData.position) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-4">Position</h2>
        <p className="text-sm text-muted-foreground">No active position. Start a loop to get leveraged exposure to STRCx.</p>
      </div>
    );
  }

  const p = positionData.position;
  const collateralStrc = parseFloat(formatBigInt(p.collateralStrc));
  const collateralUsd = collateralStrc * strcPrice;
  const debtUsd = parseFloat(formatBigInt(p.debtUsdc, 6, 2));
  const equityUsd = collateralUsd - debtUsd;
  const leverage = p.effectiveLeverage;
  const netYield = (STRC_STAKING_APY * leverage) - (MORPHO_BORROW_RATE_APY * (leverage - 1));

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Position</h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">STRCx/USD</span>
          <span className="text-sm font-mono font-semibold text-foreground">{formatUsd(strcPrice)}</span>
          {!stale && source !== 'fallback' && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Collateral</div>
          <div className="text-lg font-mono font-semibold">{formatUsd(collateralUsd)}</div>
          <div className="text-[10px] text-muted-foreground font-mono">{collateralStrc.toFixed(2)} STRCx</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Debt</div>
          <div className="text-lg font-mono font-semibold text-destructive/80">{formatUsd(debtUsd)}</div>
          <div className="text-[10px] text-muted-foreground font-mono">{debtUsd.toFixed(2)} USDC</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Equity</div>
          <div className="text-lg font-mono font-semibold text-success">{formatUsd(equityUsd)}</div>
          <div className="text-[10px] text-muted-foreground font-mono">{(equityUsd / strcPrice).toFixed(2)} STRCx eq.</div>
        </div>
      </div>

      <HealthFactorGauge hf={p.healthFactor} />

      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Leverage</span>
          <span className="text-sm font-mono font-semibold text-primary">{leverage.toFixed(1)}x</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Liq. Price</span>
          <span className="text-sm font-mono font-semibold">{formatUsd(p.liquidationPrice)}</span>
        </div>
      </div>

      <div className="rounded-md border border-border bg-background p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Morpho Borrow Rate</span>
          <span className="text-xs font-mono text-destructive/70">-{MORPHO_BORROW_RATE_APY.toFixed(2)}%</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">STRCx Yield ({leverage.toFixed(0)}x leveraged)</span>
          <span className="text-xs font-mono text-success">+{(STRC_STAKING_APY * leverage).toFixed(2)}%</span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-xs font-medium text-foreground">Effective Net Yield</span>
          <span className={cn('text-sm font-mono font-bold', netYield > 0 ? 'text-success' : 'text-destructive')}>
            {netYield > 0 ? '+' : ''}{netYield.toFixed(2)}% APY
          </span>
        </div>
      </div>
    </div>
  );
}
