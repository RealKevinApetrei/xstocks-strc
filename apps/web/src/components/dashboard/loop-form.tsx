'use client';

import { useState } from 'react';
import { cn, formatUsd } from '@/lib/utils';

// Mock price — will be replaced with real price feed
const STRC_PRICE_USD = 105.42;

const LEVERAGE_OPTIONS = [2, 3, 5] as const;

export function LoopForm() {
  const [usdcAmount, setUsdcAmount] = useState('');
  const [leverage, setLeverage] = useState<number>(2);
  const [slippageBps, setSlippageBps] = useState(100);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!usdcAmount || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // TODO: Wire to api.startLoop with Privy token
      // Backend will swap USDC → STRC first, then loop
      console.log('Starting loop:', { usdcAmount, leverage, slippageBps });
    } finally {
      setIsSubmitting(false);
    }
  };

  const amountUsdc = parseFloat(usdcAmount) || 0;
  const strcEquivalent = amountUsdc / STRC_PRICE_USD;
  const totalExposureUsdc = amountUsdc * leverage;
  const totalExposureStrc = totalExposureUsdc / STRC_PRICE_USD;
  const debtUsdc = totalExposureUsdc - amountUsdc;

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <h2 className="text-sm font-medium text-muted-foreground">Start Loop</h2>

      {/* USDC Deposit Amount */}
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
            ~{strcEquivalent.toFixed(2)} STRC at {formatUsd(STRC_PRICE_USD)}
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
        disabled={!usdcAmount || isSubmitting}
        className="w-full rounded-md bg-primary py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Starting Loop...' : `Deposit & Loop ${leverage}x`}
      </button>

      {/* Preview */}
      {amountUsdc > 0 && (
        <div className="rounded-md border border-border bg-background p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">STRC purchased</span>
            <span className="font-mono">~{strcEquivalent.toFixed(2)} STRC</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Total exposure</span>
            <div className="text-right">
              <span className="font-mono">{formatUsd(totalExposureUsdc)}</span>
              <span className="text-muted-foreground ml-1.5 font-mono">(~{totalExposureStrc.toFixed(2)} STRC)</span>
            </div>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Est. debt</span>
            <span className="font-mono">{formatUsd(debtUsdc)} USDC</span>
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
