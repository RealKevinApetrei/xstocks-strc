'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export function LoopForm() {
  const [strcAmount, setStrcAmount] = useState('');
  const [leverage, setLeverage] = useState(2);
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

  const leverageMarks = [1.5, 2, 2.5, 3, 4, 5];

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
      </div>

      {/* Leverage Slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">Target Leverage</label>
          <span className="text-sm font-mono font-semibold text-primary">{leverage.toFixed(1)}x</span>
        </div>
        <input
          type="range"
          min="1.1"
          max="5"
          step="0.1"
          value={leverage}
          onChange={(e) => setLeverage(parseFloat(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between">
          {leverageMarks.map((mark) => (
            <button
              key={mark}
              onClick={() => setLeverage(mark)}
              className={cn(
                'text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors',
                leverage === mark ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {mark}x
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
        {isSubmitting ? 'Starting Loop...' : `Loop ${leverage.toFixed(1)}x`}
      </button>

      {/* Preview */}
      {strcAmount && (
        <div className="rounded-md border border-border bg-background p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Estimated iterations</span>
            <span className="font-mono">{Math.ceil(Math.log(leverage) / Math.log(1.8))}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Total exposure</span>
            <span className="font-mono">{(parseFloat(strcAmount) * leverage).toFixed(2)} STRC</span>
          </div>
        </div>
      )}
    </div>
  );
}
