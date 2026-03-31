'use client';

import { PositionCard } from '@/components/dashboard/position-card';
import { LoopForm } from '@/components/dashboard/loop-form';
import { LoopHistory } from '@/components/dashboard/loop-history';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Top row: Position + Loop Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PositionCard />
        <LoopForm />
      </div>

      {/* Bottom: Loop History */}
      <LoopHistory />
    </div>
  );
}
