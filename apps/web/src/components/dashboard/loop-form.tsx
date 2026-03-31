'use client';

import { useState } from 'react';
import { cn, formatUsd } from '@/lib/utils';

// Mock price — will be replaced with real price feed
const STRC_PRICE_USD = 105.42;
const STRC_BASE_APY = 11;
const MORPHO_BORROW_RATE = 4.2;

const LEVERAGE_OPTIONS = [2, 3, 5] as const;

function netApy(leverage: number) {
  return (STRC_BASE_APY * leverage - MORPHO_BORROW_RATE * (leverage - 1)).toFixed(1);
}

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
          Start Loop
        </h2>
        <span className="text-[10px] text-muted-foreground font-mono">
          STRC/USD <span className="text-foreground font-medium">{formatUsd(STRC_PRICE_USD)}</span>
        </span>
      </div>

      {/* Deposit Amount */}
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
          <p className="text-[10px] text-muted-foreground font-mono text-right">
            ≈ {strcEquivalent.toFixed(4)} STRC
          </p>
        )}
      </div>

      {/* Leverage — filled dark when active */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
            Target Leverage
          </label>
          <span className="text-xs font-mono text-success font-semibold">
            ~{netApy(leverage)}% APY
          </span>
        </div>
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

      {/* Slippage — filled dark when active */}
      <div className="space-y-2">
        <label className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
          Max Slippage
        </label>
        <div className="flex gap-2">
          {[50, 100, 200, 500].map((bps) => (
            <button
              key={bps}
              onClick={() => setSlippageBps(bps)}
              className={cn(
                'flex-1 rounded-md border py-2 text-xs font-mono transition-colors',
                slippageBps === bps
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-card border-border text-muted-foreground hover:border-foreground/30',
              )}
            >
              {(bps / 100).toFixed(1)}%
            </button>
          ))}
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={handleSubmit}
        disabled={!usdcAmount || isSubmitting}
        className="w-full rounded-md bg-primary py-3.5 text-xs font-medium tracking-widest uppercase text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Opening Position...' : `Deposit & Loop ${leverage}×`}
      </button>

      {/* Position preview — only when amount entered */}
      {amountUsdc > 0 && (
        <div className="rounded-md border border-border bg-secondary p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">STRC exposure</span>
            <span className="font-mono">
              {formatUsd(totalExposureUsdc)}{' '}
              <span className="text-muted-foreground">(~{totalExposureStrc.toFixed(2)} STRC)</span>
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">USDC debt</span>
            <span className="font-mono text-destructive/70">{formatUsd(debtUsdc)}</span>
          </div>
          <div className="flex justify-between text-xs border-t border-border pt-1.5 mt-1">
            <span className="text-muted-foreground">Est. net APY</span>
            <span className="font-mono font-semibold text-success">+{netApy(leverage)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
