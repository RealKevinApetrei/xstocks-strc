'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export function GridConfig() {
  const [gridBuyPct, setGridBuyPct] = useState(25);
  const [enabled, setEnabled] = useState(true);
  const [hasStrategy, setHasStrategy] = useState(false);

  const handleSave = async () => {
    // TODO: Wire to api.createGridStrategy or api.updateGridStrategy
    console.log('Grid strategy:', { gridBuyPct, enabled });
    setHasStrategy(true);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Buy-the-Dip Strategy</h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Auto</span>
          <button
            onClick={() => setEnabled(!enabled)}
            className={cn(
              'relative h-5 w-9 rounded-full transition-colors',
              enabled ? 'bg-primary' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                enabled ? 'left-[18px]' : 'left-0.5',
              )}
            />
          </button>
        </div>
      </div>

      {/* Threshold display (fixed) */}
      <div className="rounded-md border border-border bg-background p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Trigger Price</span>
          <span className="text-sm font-mono font-semibold">
            &lt; $103.00
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          When STRC drops below $103, automatically buy the dip with vault USDC and loop it.
        </p>
      </div>

      {/* Grid buy percentage */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">Deploy % of vault per trigger</label>
          <span className="text-sm font-mono font-semibold text-primary">{gridBuyPct}%</span>
        </div>
        <input
          type="range"
          min="5"
          max="100"
          step="5"
          value={gridBuyPct}
          onChange={(e) => setGridBuyPct(parseInt(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between">
          {[10, 25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              onClick={() => setGridBuyPct(pct)}
              className={cn(
                'text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors',
                gridBuyPct === pct ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!enabled}
        className="w-full rounded-md bg-secondary py-2.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
      >
        {hasStrategy ? 'Update Strategy' : 'Enable Strategy'}
      </button>

      {/* Status */}
      {hasStrategy && (
        <div className="flex items-center gap-2 text-xs">
          <span className={cn('h-2 w-2 rounded-full', enabled ? 'bg-success animate-pulse' : 'bg-muted-foreground')} />
          <span className="text-muted-foreground">
            {enabled ? 'Monitoring STRC price' : 'Strategy paused'}
          </span>
        </div>
      )}
    </div>
  );
}
