'use client';

import { PositionCard } from '@/components/dashboard/position-card';
import { LoopForm } from '@/components/dashboard/loop-form';
import { UnwindButton } from '@/components/dashboard/unwind-button';
import { LoopHistory } from '@/components/dashboard/loop-history';
import { usePosition } from '@/hooks/use-position';

export default function Dashboard() {
  const { data: position } = usePosition();

  return (
    <div className="space-y-6">
      {/* Position + Loop Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <PositionCard />
          <UnwindButton loopId={position?.activeLoop?.id ?? null} />
        </div>
        <LoopForm />
      </div>

      {/* Loop History + Performance tabs */}
      <LoopHistory />
    </div>
  );
}
