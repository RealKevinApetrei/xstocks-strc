'use client';

import { PositionCard } from '@/components/dashboard/position-card';
import { LoopForm } from '@/components/dashboard/loop-form';
import { UnwindButton } from '@/components/dashboard/unwind-button';
import { LoopHistory } from '@/components/dashboard/loop-history';
import { DepositsHero } from '@/components/dashboard/deposits-hero';
import { usePosition } from '@/hooks/use-position';

export default function Dashboard() {
  const { data: position } = usePosition();

  return (
    <div className="space-y-5">
      {/* Hero — animated deposits + APY */}
      <DepositsHero />


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
