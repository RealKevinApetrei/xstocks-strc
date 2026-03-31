'use client';

import { BuyTheDipVault } from '@/components/vaults/buy-the-dip-vault';
import { PerformanceChart } from '@/components/vaults/performance-chart';

export default function StrategyVaults() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Strategy Vaults</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Automated strategies that earn yield on idle capital and deploy it when opportunities arise.
        </p>
      </div>

      {/* Buy the Dip Vault */}
      <BuyTheDipVault />

      {/* Historical Performance */}
      <PerformanceChart />
    </div>
  );
}
