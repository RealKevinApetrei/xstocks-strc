'use client';

import { PositionCard } from '@/components/dashboard/position-card';
import { LoopForm } from '@/components/dashboard/loop-form';
import { UnwindButton } from '@/components/dashboard/unwind-button';
import { LoopHistory } from '@/components/dashboard/loop-history';
import { DepositsHero } from '@/components/dashboard/deposits-hero';
import { usePosition } from '@/hooks/use-position';
import { useMarketRate } from '@/hooks/use-market-rate';

const STRC_APY = 11.5;

export default function Dashboard() {
  const { data: position } = usePosition();
  const { borrowApy, loading: rateLoading } = useMarketRate();

  return (
    <div className="space-y-5">
      {/* Hero — animated deposits + APY */}
      <DepositsHero />

      {/* Top stat bar */}
      <div className="grid grid-cols-3 gap-px border border-border rounded-lg overflow-hidden bg-border">
        <div className="bg-card px-5 py-4">
          <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-1">
            STRC Dividend Yield
          </p>
          <p className="text-xl font-mono font-semibold text-success">+{STRC_APY}%</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Base APY</p>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-1">
            Net APY @ 5x
          </p>
          {rateLoading || borrowApy === null ? (
            <div className="h-7 w-20 bg-secondary animate-pulse rounded mt-0.5" />
          ) : (
            <p className="text-xl font-mono font-semibold text-success">
              +{(STRC_APY * 5 - borrowApy * 4).toFixed(1)}%
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">After borrow cost</p>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-1">
            Borrow Rate
          </p>
          {rateLoading || borrowApy === null ? (
            <div className="h-7 w-16 bg-secondary animate-pulse rounded mt-0.5" />
          ) : (
            <p className="text-xl font-mono font-semibold">{borrowApy}%</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">Morpho · variable</p>
        </div>
      </div>

      {/* Position + Loop Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <PositionCard />
          <UnwindButton
            loopId={position?.activeLoop?.id ?? null}
            currentLeverage={position?.position?.effectiveLeverage}
          />
        </div>
        <LoopForm />
      </div>

      <LoopHistory />
    </div>
  );
}
