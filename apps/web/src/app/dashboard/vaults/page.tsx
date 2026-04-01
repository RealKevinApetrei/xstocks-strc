'use client';

import { OrangeDotVault } from '@/components/vaults/orange-dot-vault';

export default function StrategyVaults() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Strategy Vaults</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Automated strategies that earn yield on idle capital and deploy it when opportunities arise.
        </p>
      </div>

      <OrangeDotVault />
    </div>
  );
}
