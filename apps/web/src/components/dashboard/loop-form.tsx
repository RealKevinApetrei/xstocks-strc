'use client';

import { useState } from 'react';
import { cn, formatUsd } from '@/lib/utils';

// Mock Pyth price
const STRC_PRICE_USD = 105.42;

const LEVERAGE_OPTIONS = [2, 3, 5] as const;

export function LoopForm() {
  const [strcAmount, setStrcAmount] = useState('');
  const [leverage, setLeverage] = useState<number>(2);
  const [slippageBps, setSlippageBps] = useState(100);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!strcAmount || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // TODO: Wire to api.startLoop with Privy token
      console.log('Starting loop:', { strcAmount, leverage, slippageBps });
    } finally {
      setIsSubmitting(false);
    }
  };

  const amountNum = parseFloat(strcAmount) || 0;
  const amountUsd = amountNum * STRC_PRICE_USD;
  const totalExposureStrc = amountNum * leverage;
  const totalExposureUsd = totalExposureStrc * STRC_PRICE_USD;

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <h2 className="text-sm font-medium text-muted-foreground">Start Loop</h2>

      {/* STRC Amount */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">STRC Amount</label>
        <div className="relative">
          <input
            type="text"
            value={strcAmount}
            onChange={(e) => setStrcAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.0"
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 font-mono text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">STRC</span>
        </div>
        {amountNum > 0 && (
          <div className="text-[10px] text-muted-foreground font-mono text-right">
            {formatUsd(amountUsd)}
          </div>
        )}
      </div>

      {/* Leverage Selection — only 2x, 3x, 5x */}
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

      {/* Slippage */}
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

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!strcAmount || isSubmitting}
        className="w-full rounded-md bg-primary py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Starting Loop...' : `Loop ${leverage}x`}
      </button>

      {/* Preview */}
      {amountNum > 0 && (
        <div className="rounded-md border border-border bg-background p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Total exposure</span>
            <div className="text-right">
              <span className="font-mono">{totalExposureStrc.toFixed(2)} STRC</span>
              <span className="text-muted-foreground ml-1.5 font-mono">({formatUsd(totalExposureUsd)})</span>
            </div>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Est. debt</span>
            <span className="font-mono">{formatUsd(totalExposureUsd - amountUsd)} USDC</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Est. iterations</span>
            <span className="font-mono">{Math.ceil(Math.log(leverage) / Math.log(1.8))}</span>
          </div>
        </div>
      )}
    </div>
  );
}
