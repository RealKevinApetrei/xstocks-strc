'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PositionCard } from '@/components/dashboard/position-card';
import { LoopForm } from '@/components/dashboard/loop-form';
import { VaultPanel } from '@/components/dashboard/vault-panel';
import { GridConfig } from '@/components/dashboard/grid-config';
import { LoopHistory } from '@/components/dashboard/loop-history';

export default function Dashboard() {
  const { ready, authenticated, logout, user } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && !authenticated) {
      router.push('/');
    }
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          x<span className="text-primary">Stocks</span>
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground font-mono">
            {user?.wallet?.address
              ? `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}`
              : 'No wallet'}
          </span>
          <button
            onClick={logout}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Disconnect
          </button>
        </div>
      </header>

      {/* Dashboard Grid */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Top row: Position + Loop Form */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PositionCard />
          <LoopForm />
        </div>

        {/* Middle row: Vault + Grid Strategy */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <VaultPanel />
          <GridConfig />
        </div>

        {/* Bottom: Loop History */}
        <LoopHistory />
      </main>
    </div>
  );
}
