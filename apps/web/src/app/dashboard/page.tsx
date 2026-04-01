'use client';

import { PositionCard } from '@/components/dashboard/position-card';
import { LoopCard } from '@/components/dashboard/loop-card';
import { LoopHistory } from '@/components/dashboard/loop-history';
import { DepositsHero } from '@/components/dashboard/deposits-hero';

export default function Dashboard() {
  return (
    <div className="space-y-5">
      <DepositsHero />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PositionCard />
        <LoopCard />
      </div>

      <LoopHistory />
    </div>
  );
}
