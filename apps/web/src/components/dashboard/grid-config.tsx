'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export function GridConfig() {
  const [gridBuyPct, setGridBuyPct] = useState(25);
  const [hfThreshold, setHfThreshold] = useState(1.5);
  const [enabled, setEnabled] = useState(true);
  const [hasStrategy, setHasStrategy] = useState(false);

  const handleSave = async () => {
    // TODO: Wire to api.createGridStrategy or api.updateGridStrategy
    console.log('Grid strategy:', { gridBuyPct, hfThreshold, enabled });
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

      {/* HF threshold */}
      <div className="rounded-md border border-border bg-background p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Trigger when Health Factor</span>
          <span className="text-sm font-mono font-semibold">
            &lt; {hfThreshold.toFixed(1)}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          When your position health factor drops below this level, automatically deploy vault USDC to buy STRC and strengthen your position.
        </p>
      </div>

      {/* HF threshold selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">HF trigger level</label>
          <span className="text-sm font-mono font-semibold text-primary">{hfThreshold.toFixed(1)}</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[1.3, 1.5, 1.8, 2.0].map((hf) => (
            <button
              key={hf}
              onClick={() => setHfThreshold(hf)}
              className={cn(
                'rounded-md border py-2 text-center font-mono text-xs font-semibold transition-all',
                hfThreshold === hf
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground',
              )}
            >
              {hf.toFixed(1)}
            </button>
          ))}
        </div>
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

      {hasStrategy && (
        <div className="flex items-center gap-2 text-xs">
          <span className={cn('h-2 w-2 rounded-full', enabled ? 'bg-success animate-pulse' : 'bg-muted-foreground')} />
          <span className="text-muted-foreground">
            {enabled ? 'Monitoring position health factor' : 'Strategy paused'}
          </span>
        </div>
      )}
    </div>
  );
}
