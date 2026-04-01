'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import type { Portfolio } from '../page';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

export function DepositModal({
  plan,
  onClose,
  onDeposited,
}: {
  plan: NonNullable<Portfolio['plan']>;
  onClose: () => void;
  onDeposited: () => void;
}) {
  const { getAccessToken } = usePrivy();
  const [amount, setAmount] = useState<string>('');
  const [depositing, setDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numAmount = parseFloat(amount) || 0;
  const strcSplit = numAmount * (plan.strcPct / 100);
  const tbillSplit = numAmount - strcSplit;
  const weekend = isWeekend();

  async function deposit() {
    if (numAmount < 10) { setError('Minimum deposit is $10'); return; }
    setDepositing(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${API}/api/savings/deposit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ usdcAmount: numAmount }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? 'Deposit failed'); return; }
      onDeposited();
    } finally {
      setDepositing(false);
    }
  }

  const quickAmounts = [50, 100, 250, 500];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Deposit USDC</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            ✕
          </button>
        </div>

        {/* Amount input */}
        <div className="space-y-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <input
              type="number"
              min={10}
              step={10}
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
              className="w-full rounded-md border border-border bg-secondary pl-7 pr-4 py-3 text-2xl font-semibold text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Quick amounts */}
          <div className="flex gap-2">
            {quickAmounts.map(q => (
              <button
                key={q}
                onClick={() => setAmount(String(q))}
                className="flex-1 rounded-md border border-border py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors"
              >
                ${q}
              </button>
            ))}
          </div>
        </div>

        {/* Split preview */}
        {numAmount > 0 && (
          <div className="rounded-md bg-secondary p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Allocation Preview</p>
            <div className="flex justify-between text-sm">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span>STRC ({plan.strcPct}%)</span>
              </div>
              <span className="font-medium">${strcSplit.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-success/60" />
                <span>Invesco T-Bill ({plan.tbillPct}%)</span>
              </div>
              <span className="font-medium">${tbillSplit.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Weekend notice */}
        {weekend && (
          <div className="rounded-md bg-warning/10 border border-warning/20 p-3">
            <p className="text-xs text-warning font-medium">Markets closed this weekend</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your deposit will be queued and allocated Monday morning when markets open.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-border py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={deposit}
            disabled={depositing || numAmount < 10}
            className="flex-1 rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            {depositing ? 'Depositing...' : weekend ? 'Deposit & Queue' : 'Deposit'}
          </button>
        </div>
      </div>
    </div>
  );
}
