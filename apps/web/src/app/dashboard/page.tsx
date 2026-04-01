'use client';

import { LeftPanel } from '@/components/dashboard/left-panel';
import { LoopCard } from '@/components/dashboard/loop-card';
import { DepositsHero } from '@/components/dashboard/deposits-hero';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <DepositsHero />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <LeftPanel />
        <LoopCard />
      </div>
    </div>
  );
}
