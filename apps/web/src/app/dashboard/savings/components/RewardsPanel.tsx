'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import type { Portfolio } from '../page';

interface Product {
  id: string;
  name: string;
  category: string;
  minValue: number;
  logoUrl: string;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function RewardsPanel({
  portfolio,
  onRedeemed,
}: {
  portfolio: Portfolio;
  onRedeemed: () => void;
}) {
  const { getAccessToken } = usePrivy();
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redemptionCode, setRedemptionCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const available = portfolio.portfolio.rewardsAvailableUsd;

  useEffect(() => {
    async function loadCatalog() {
      const token = await getAccessToken();
      const res = await fetch(`${API}/api/savings/catalog`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as { products: Product[] };
        setProducts(data.products.filter(p => p.minValue <= Math.max(available, p.minValue)));
      }
    }
    loadCatalog();
  }, [available]);

  async function redeem() {
    if (!selected) return;
    setRedeeming(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${API}/api/savings/redeem`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: selected.id, valueUsd: selected.minValue }),
      });
      const data = await res.json() as { redemptionCode?: string; error?: string };
      if (!res.ok) { setError(data.error ?? 'Redemption failed'); return; }
      setRedemptionCode(data.redemptionCode ?? null);
      onRedeemed();
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4 sticky top-4">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rewards Available</p>
        <p className="text-3xl font-semibold mt-1">${available.toFixed(2)}</p>
        {portfolio.portfolio.rewardMultiplier > 1 && (
          <p className="text-xs text-primary mt-0.5">{portfolio.portfolio.rewardMultiplier}× multiplier active</p>
        )}
      </div>

      {redemptionCode ? (
        <div className="rounded-md bg-success/10 border border-success/20 p-4 space-y-2">
          <p className="text-xs font-medium text-success uppercase tracking-wider">Gift Card Code</p>
          <p className="font-mono text-lg font-bold text-foreground">{redemptionCode}</p>
          <p className="text-xs text-muted-foreground">Copy this code and use it at {selected?.name}</p>
          <button
            onClick={() => { setRedemptionCode(null); setSelected(null); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Redeem another →
          </button>
        </div>
      ) : available < 5 ? (
        <div className="rounded-md bg-secondary p-4 space-y-1">
          <p className="text-sm font-medium">Keep saving!</p>
          <p className="text-xs text-muted-foreground">
            ${(5 - available).toFixed(2)} more in yield to unlock gift cards.
          </p>
          <div className="h-1.5 rounded-full bg-border mt-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, (available / 5) * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Select a gift card to redeem your yield rewards</p>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(s => s?.id === p.id ? null : p)}
                className={`w-full flex items-center justify-between rounded-md border px-3 py-2.5 text-left transition-colors ${
                  selected?.id === p.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-border/80 hover:bg-secondary'
                }`}
              >
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.category} · from ${p.minValue}</p>
                </div>
                {selected?.id === p.id && (
                  <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            onClick={redeem}
            disabled={!selected || redeeming}
            className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            {redeeming ? 'Redeeming...' : selected ? `Redeem ${selected.name} Gift Card` : 'Select a Gift Card'}
          </button>

          <p className="text-[10px] text-muted-foreground text-center">
            Powered by Bitrefill · Demo mode
          </p>
        </div>
      )}
    </div>
  );
}
