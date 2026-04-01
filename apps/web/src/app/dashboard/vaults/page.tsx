'use client';

import { OrangeDotVault } from '@/components/vaults/orange-dot-vault';
import { LendUsdcVault } from '@/components/vaults/lend-usdc-vault';

export default function StrategyVaults() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Strategy Vaults</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Automated strategies that earn yield on idle capital and deploy it when opportunities arise.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <OrangeDotVault />
        <LendUsdcVault />
      </div>
    </div>
  );
}
