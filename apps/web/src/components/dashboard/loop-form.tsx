'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { cn, formatUsd } from '@/lib/utils';
import { useStrcxPrice } from '@/hooks/use-strcx-price';
import { api, ApiError } from '@/lib/api';
import { LoopStatus } from './loop-status';

const LEVERAGE_OPTIONS = [2, 3, 5] as const;

export function LoopForm() {
  const { getAccessToken } = usePrivy();
  const { price: strcPrice } = useStrcxPrice();
  const [usdcAmount, setUsdcAmount] = useState('');
  const [leverage, setLeverage] = useState<number>(2);
  const [slippageBps, setSlippageBps] = useState(100);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeLoopId, setActiveLoopId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!usdcAmount || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const result = await api.startLoop(token, {
        strcAmount: usdcAmount,
        targetLeverage: leverage,
        maxSlippageBps: slippageBps,
      });
      setActiveLoopId(result.id);
      setUsdcAmount('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start loop');
    } finally {
      setIsSubmitting(false);
    }
  };

  const amountUsdc = parseFloat(usdcAmount) || 0;
  const strcEquivalent = strcPrice > 0 ? amountUsdc / strcPrice : 0;
  const totalExposureUsdc = amountUsdc * leverage;
  const debtUsdc = totalExposureUsdc - amountUsdc;

  // Show loop status if active
  if (activeLoopId) {
    return <LoopStatus loopId={activeLoopId} onClose={() => setActiveLoopId(null)} />;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <h2 className="text-sm font-medium text-muted-foreground">Start Loop</h2>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Deposit Amount</label>
        <div className="relative">
          <input
            type="text"
            value={usdcAmount}
            onChange={(e) => setUsdcAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 font-mono text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">USDC</span>
        </div>
        {amountUsdc > 0 && (
          <div className="text-[10px] text-muted-foreground font-mono text-right">
            ~{strcEquivalent.toFixed(2)} STRCx at {formatUsd(strcPrice)}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">Target Leverage</label>
          <span className="text-sm font-mono font-semibold text-primary">{leverage}x</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {LEVERAGE_OPTIONS.map((lev) => (
            <button
              key={lev}
              onClick={() => setLeverage(lev)}
              className={cn(
                'rounded-md border py-3 text-center font-mono text-sm font-semibold transition-all',
                leverage === lev
                  ? 'border-primary bg-primary/10 text-primary shadow-sm shadow-primary/20'
                  : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground',
              )}
            >
              {lev}x
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Max Slippage</label>
        <div className="flex gap-2">
          {[50, 100, 200, 500].map((bps) => (
            <button
              key={bps}
              onClick={() => setSlippageBps(bps)}
              className={cn(
                'flex-1 rounded-md border px-2 py-1.5 text-xs font-mono transition-colors',
                slippageBps === bps
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-foreground/20',
              )}
            >
              {(bps / 100).toFixed(1)}%
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!usdcAmount || isSubmitting}
        className="w-full rounded-md bg-primary py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Starting Loop...' : `Deposit & Loop ${leverage}x`}
      </button>

      {amountUsdc > 0 && (
        <div className="rounded-md border border-border bg-background p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">STRCx purchased</span>
            <span className="font-mono">~{strcEquivalent.toFixed(2)} STRCx</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Total exposure</span>
            <span className="font-mono">{formatUsd(totalExposureUsdc)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Est. debt</span>
            <span className="font-mono">{formatUsd(debtUsdc)} USDC</span>
          </div>
        </div>
      )}
    </div>
  );
}
