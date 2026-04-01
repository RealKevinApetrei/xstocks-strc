'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { cn, formatBigInt, formatUsd, aprToApy } from '@/lib/utils';
import { usePosition } from '@/hooks/use-position';
import { useStrcxPrice } from '@/hooks/use-strcx-price';
import { useMarketRate } from '@/hooks/use-market-rate';
import { useStrcBalance } from '@/hooks/use-strc-balance';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { api, ApiError } from '@/lib/api';

const STRC_STAKING_APY = 11.5;

function HealthFactorGauge({ hf }: { hf: number }) {
  const isInfinity = hf >= 99;
  const clampedHf = isInfinity ? 3 : hf;
  const targetPct = Math.min(Math.max((clampedHf - 1) / 2, 0), 1) * 100;
  const [displayPct, setDisplayPct] = useState(isInfinity ? 100 : 0);
  const [displayHf, setDisplayHf] = useState(isInfinity ? 3 : 1);

  useEffect(() => {
    if (isInfinity) {
      setDisplayPct(100);
      setDisplayHf(3);
      return;
    }

    const timeout = setTimeout(() => {
      const start = performance.now();
      const duration = 900;

      function tick(now: number) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayPct(eased * targetPct);
        setDisplayHf(1 + eased * (clampedHf - 1));
        if (progress < 1) requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    }, 200);

    return () => clearTimeout(timeout);
  }, [hf, targetPct, isInfinity, clampedHf]);
  const color = isInfinity ? 'text-success' : hf > 2 ? 'text-success' : hf > 1.5 ? 'text-warning' : 'text-destructive';
  const barColor = isInfinity ? 'bg-success' : hf > 2 ? 'bg-success' : hf > 1.5 ? 'bg-warning' : 'bg-destructive';
  const glowColor = isInfinity ? 'shadow-success/30' : hf > 2 ? 'shadow-success/30' : hf > 1.5 ? 'shadow-warning/30' : 'shadow-destructive/30';
  const label = isInfinity ? 'NO DEBT' : hf > 2 ? 'SAFE' : hf > 1.5 ? 'CAUTION' : 'DANGER';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Health Factor</span>
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-mono font-semibold uppercase tracking-wider', color)}>{label}</span>
          <span className={cn('text-lg font-mono font-bold', color)}>{isInfinity ? '∞' : displayHf.toFixed(2)}</span>
        </div>
      </div>
      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('absolute left-0 top-0 h-full rounded-full shadow-md', barColor, glowColor)}
          style={{ width: `${displayPct}%`, transition: 'none' }}
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

function StrcPositionCard({ strcAmount, strcPrice, hasWstrc, onClosed }: { strcAmount: number; strcPrice: number; hasWstrc?: boolean; onClosed: () => void }) {
  const { getAccessToken } = usePrivy();
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const valueUsd = strcAmount * strcPrice;

  const handleClose = async () => {
    setClosing(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const result = await api.closeStrc(token);
      const usdcReceived = (Number(result.usdcReceived) / 1e6).toFixed(2);
      setSuccess(`Position closed — received $${usdcReceived} USDC`);
      onClosed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to close');
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-background p-3 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{hasWstrc ? 'STRCx held (inc. wrapped)' : 'STRCx held'}</span>
          <span className="font-mono font-medium">{strcAmount.toFixed(4)} STRCx</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Leverage</span>
          <span className="font-mono">1×</span>
        </div>
        <div className="flex justify-between text-xs border-t border-border pt-2 mt-1">
          <span className="text-muted-foreground font-medium">Value</span>
          <span className="font-mono font-semibold text-success">{formatUsd(valueUsd)}</span>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
          <p className="text-[10px] text-destructive">{error}</p>
        </div>
      )}
      {success && (
        <div className="rounded-md border border-success/30 bg-success/5 p-2">
          <p className="text-[10px] text-success">{success}</p>
        </div>
      )}

      <button
        onClick={handleClose}
        disabled={closing}
        className="w-full rounded-md bg-secondary py-2.5 text-xs font-medium uppercase tracking-wider text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-40"
      >
        {closing ? (hasWstrc ? 'Unwrapping & Selling...' : 'Selling...') : 'Sell STRCx → USDC'}
      </button>
    </div>
  );
}

export function PositionCard() {
  const { data: positionData, loading } = usePosition();
  const { price: strcPrice, stale, source } = useStrcxPrice();
  const { borrowApy, loading: rateLoading } = useMarketRate();
  const strcBalance = useStrcBalance();
  const { refresh: refreshUsdcBalance } = useUsdcBalance();

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

  // Treat as no position if collateral and debt are effectively zero
  const p_ = positionData?.position;
  const effectivelyEmpty = p_ && parseFloat(formatBigInt(p_.collateralStrc)) < 0.001 && parseFloat(formatBigInt(p_.debtUsdc, 6, 2)) < 0.01;

  // Check for wSTRC balance (stuck from partial loop — wrap succeeded but supply didn't)
  const hasWalletTokens = strcBalance.totalFormatted > 0.001;

  if (!positionData?.hasPosition || !positionData.position || effectivelyEmpty) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">Position</h2>
        {(positionData as any)?.error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs text-destructive">Failed to load position: {(positionData as any).error}</p>
          </div>
        )}
        {hasWalletTokens ? (
          <StrcPositionCard
            strcAmount={strcBalance.totalFormatted}
            strcPrice={strcPrice}
            hasWstrc={strcBalance.wstrcFormatted > 0.001}
            onClosed={() => { strcBalance.refresh(); refreshUsdcBalance(); }}
          />
        ) : !((positionData as any)?.error) ? (
          <p className="text-sm text-muted-foreground">No active position. Start a loop to get leveraged exposure to STRCx.</p>
        ) : null}
      </div>
    );
  }

  const p = positionData.position;
  const collateralStrc = parseFloat(formatBigInt(p.collateralStrc));
  const collateralUsd = collateralStrc * strcPrice;
  const debtUsd = parseFloat(formatBigInt(p.debtUsdc, 6, 2));
  const equityUsd = collateralUsd - debtUsd;
  const leverage = p.effectiveLeverage;
  const netApr = borrowApy !== null
    ? (STRC_STAKING_APY * leverage) - (borrowApy * (leverage - 1))
    : 0;
  const netYield = aprToApy(netApr);

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <h2 className="text-sm font-medium text-muted-foreground">Position</h2>

      <div className="grid grid-cols-4 gap-3">
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
        <div>
          <div className="text-xs text-muted-foreground mb-1">Borrow Rate</div>
          {rateLoading || borrowApy === null ? (
            <div className="h-7 w-12 bg-secondary animate-pulse rounded" />
          ) : (
            <div className="text-lg font-mono font-semibold text-destructive/70">-{borrowApy.toFixed(1)}%</div>
          )}
          <div className="text-[10px] text-muted-foreground font-mono">Morpho APY</div>
        </div>
      </div>

      <HealthFactorGauge hf={p.healthFactor} />

      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Leverage</span>
          {positionData.activeLoop?.status === 'IN_PROGRESS' ? (
            <span className="text-sm font-mono font-semibold text-primary animate-pulse">{leverage.toFixed(1)}x <span className="text-[10px] text-muted-foreground">building</span></span>
          ) : (positionData as any).activeUnwind?.status === 'IN_PROGRESS' ? (
            <span className="text-sm font-mono font-semibold text-warning animate-pulse">{leverage.toFixed(1)}x <span className="text-[10px] text-muted-foreground">unwinding</span></span>
          ) : (
            <span className="text-sm font-mono font-semibold text-primary">{leverage.toFixed(1)}x</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Borrow Rate</span>
          {rateLoading || borrowApy === null ? (
            <span className="inline-block h-5 w-10 bg-secondary animate-pulse rounded" />
          ) : (
            <span className="text-sm font-mono font-semibold text-destructive/70">-{borrowApy.toFixed(1)}%</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Liq. Price</span>
          <span className="text-sm font-mono font-semibold">{formatUsd(p.liquidationPrice)}</span>
        </div>
      </div>

      <div className="rounded-md border border-border bg-background p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">STRCx Yield ({leverage.toFixed(1)}x leveraged)</span>
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
