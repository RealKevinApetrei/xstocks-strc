'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { cn, formatUsd } from '@/lib/utils';
import { useStrcxPrice } from '@/hooks/use-strcx-price';
import { api, ApiError } from '@/lib/api';
import { LoopStatus } from './loop-status';

const STRC_BASE_APY = 11.5;
const MORPHO_BORROW_RATE = 4.2;
const LEVERAGE_OPTIONS = [2, 3, 5] as const;
const STRC_BASE_APY = 11.5;
const MORPHO_BORROW_RATE = 4.2;

function netApy(leverage: number) {
  return (STRC_BASE_APY * leverage - MORPHO_BORROW_RATE * (leverage - 1)).toFixed(1);
}

export function LoopForm() {
  const { getAccessToken } = usePrivy();
  const { price: strcPrice } = useStrcxPrice();
  const [usdcAmount, setUsdcAmount] = useState('');
  const [leverage, setLeverage] = useState<number>(2);
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
        maxSlippageBps: 0, // CoW RFQ — no slippage
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
          Start Loop
        </h2>
        <span className="text-[10px] text-muted-foreground font-mono">
          STRC/USD <span className="text-foreground font-medium">{formatUsd(strcPrice)}</span>
        </span>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
          Deposit Amount
        </label>
        <div className="relative">
          <input
            type="text"
            value={usdcAmount}
            onChange={(e) => setUsdcAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            className="w-full rounded-md border border-border bg-secondary px-3 py-3 font-mono text-lg placeholder:text-muted-foreground focus:border-foreground focus:outline-none transition-colors"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tracking-wide">
            USDC
          </span>
        </div>
        {amountUsdc > 0 && (
          <div className="text-[10px] text-muted-foreground font-mono text-right">
            ~{strcEquivalent.toFixed(2)} STRCx at {formatUsd(strcPrice)}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <label className="text-xs text-muted-foreground">Target Leverage</label>
        <div className="grid grid-cols-3 gap-2">
          {LEVERAGE_OPTIONS.map((lev) => (
            <button
              key={lev}
              onClick={() => setLeverage(lev)}
              className={cn(
                'rounded-md border py-3 text-center font-mono text-sm font-semibold transition-all',
                leverage === lev
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-card border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
              )}
            >
              {lev}x
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
        className="w-full rounded-md bg-primary py-3.5 text-xs font-medium tracking-widest uppercase text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Opening Position...' : `Deposit & Loop ${leverage}×`}
      </button>

      {amountUsdc > 0 && (
        <div className="rounded-md border border-border bg-secondary p-3 space-y-1.5">
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
