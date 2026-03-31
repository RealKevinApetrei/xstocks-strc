'use client';

import { AccountOverview } from '@/components/dashboard/account-overview';
import { PositionCard } from '@/components/dashboard/position-card';
import { LoopForm } from '@/components/dashboard/loop-form';
import { LoopHistory } from '@/components/dashboard/loop-history';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Account Overview — Terminal Total Value */}
      <AccountOverview />

      {/* Position + Loop Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PositionCard />
        <LoopForm />
      </div>

      {/* Loop History */}
      <LoopHistory />
    </div>
  );
}
