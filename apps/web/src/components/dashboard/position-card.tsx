'use client';

import { cn, formatBigInt, formatUsd, formatPercent } from '@/lib/utils';

// TODO: Wire to usePosition hook with real data
const mockPosition = {
  hasPosition: true,
  collateralStrc: '5000000000000000000000',
  debtUsdc: '2500000000',
  healthFactor: 1.82,
  effectiveLeverage: 2.4,
  liquidationPrice: 68.5,
  exchangeRate: '1050000000000000000',
};

function HealthIndicator({ hf }: { hf: number }) {
  const color = hf > 2 ? 'text-success' : hf > 1.5 ? 'text-warning' : 'text-destructive';
  const bg = hf > 2 ? 'bg-success/10' : hf > 1.5 ? 'bg-warning/10' : 'bg-destructive/10';
  const borderColor = hf > 2 ? 'border-success/30' : hf > 1.5 ? 'border-warning/30' : 'border-destructive/30';
  const label = hf > 2 ? 'SAFE' : hf > 1.5 ? 'CAUTION' : 'DANGER';

  return (
    <div className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-mono', bg, borderColor, color)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', hf > 2 ? 'bg-success' : hf > 1.5 ? 'bg-warning' : 'bg-destructive')} />
      {label} &middot; {hf.toFixed(2)}
    </div>
  );
}

export function PositionCard() {
  const p = mockPosition;

  if (!p.hasPosition) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-4">Position</h2>
        <p className="text-sm text-muted-foreground">No active position. Start a loop to get leveraged exposure to STRC.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Position</h2>
        <HealthIndicator hf={p.healthFactor} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Stat label="Collateral" value={`${formatBigInt(p.collateralStrc)} STRC`} />
        <Stat label="Debt" value={`${formatBigInt(p.debtUsdc, 6, 2)} USDC`} />
        <Stat label="Leverage" value={`${p.effectiveLeverage.toFixed(1)}x`} highlight />
        <Stat label="Liq. Price" value={formatUsd(p.liquidationPrice)} />
      </div>

      <div className="pt-2 border-t border-border">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>wSTRC Rate</span>
          <span className="font-mono">{formatBigInt(p.exchangeRate)} STRC/wSTRC</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={cn('text-lg font-mono font-semibold', highlight && 'text-primary')}>
        {value}
      </div>
    </div>
  );
}
