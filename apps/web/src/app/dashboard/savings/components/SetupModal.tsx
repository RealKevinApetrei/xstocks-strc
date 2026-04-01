'use client';

import { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import type { Portfolio } from '../page';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function SetupModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: Portfolio['plan'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const [monthlyTarget, setMonthlyTarget] = useState(existing?.monthlyTargetUsdc ?? 100);
  const [strcPct, setStrcPct] = useState(existing?.strcPct ?? 70);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const smartAccountAddress = wallets[0]?.address ?? '';
      const res = await fetch(`${API}/api/savings/plan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyTargetUsdc: monthlyTarget, strcPct, smartAccountAddress }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to save plan'); return; }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {existing ? 'Edit Savings Plan' : 'Set Up Savings Club'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            ✕
          </button>
        </div>

        {/* Monthly target */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Monthly Savings Goal
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <input
              type="number"
              min={50}
              step={50}
              value={monthlyTarget}
              onChange={e => setMonthlyTarget(Number(e.target.value))}
              className="w-full rounded-md border border-border bg-secondary pl-7 pr-4 py-2.5 text-lg font-medium text-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <p className="text-xs text-muted-foreground">Minimum $50 / month</p>
        </div>

        {/* Basket slider */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Basket Allocation
          </label>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="font-medium">STRC</span>
            </div>
            <span className="font-semibold text-primary">{strcPct}%</span>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            value={strcPct}
            onChange={e => setStrcPct(Number(e.target.value))}
            className="w-full accent-primary"
          />

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-success/60" />
              <span className="font-medium">Invesco T-Bill</span>
            </div>
            <span className="font-semibold text-success/80">{100 - strcPct}%</span>
          </div>

          {/* Visual bar */}
          <div className="h-2 rounded-full overflow-hidden flex">
            <div className="bg-primary h-full transition-all" style={{ width: `${strcPct}%` }} />
            <div className="bg-success/60 h-full transition-all" style={{ width: `${100 - strcPct}%` }} />
          </div>

          <p className="text-xs text-muted-foreground">
            Both are xStock tokens swapped via CoW Protocol on INK chain.
          </p>
        </div>

        {/* Tier preview */}
        <div className="rounded-md bg-secondary p-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tier Rewards</p>
          <div className="flex gap-4 text-xs mt-2">
            <div className="text-amber-500">Bronze · 1× rewards</div>
            <div className="text-slate-400">Silver · 1.1× · 3mo streak</div>
            <div className="text-yellow-400">Gold · 1.25× · 6mo streak</div>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-border py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || monthlyTarget < 50}
            className="flex-1 rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving...' : existing ? 'Update Plan' : 'Start Saving'}
          </button>
        </div>
      </div>
    </div>
  );
}
