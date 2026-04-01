'use client';

import { formatUsd } from '@/lib/utils';

export function BtcHedgeVault() {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><path d="M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 20.364l3.126-17.727"/></svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold">BTC Hedging Vault</h2>
              <p className="text-[10px] text-muted-foreground">Hedge BTC volatility risk from STRC looping</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground">Cost (APY)</div>
            <div className="text-sm font-mono font-semibold text-amber-500">~6% APY</div>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4 flex-1">
        {/* Protected Notional */}
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">Protected Notional</div>
          <div className="text-xl font-mono font-semibold">{formatUsd(0)}</div>
        </div>

        {/* Strategy info */}
        <div className="rounded-md border border-border bg-background p-3 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Strategy</span>
            <span className="font-mono">OTM Put Spreads</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Strike</span>
            <span className="font-mono">10-15% OTM</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Expiry</span>
            <span className="font-mono">Monthly rolling</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Max cost</span>
            <span className="font-mono">~0.5% of notional/month</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Downside protection</span>
            <span className="font-mono text-success">Up to 25%</span>
          </div>
        </div>

        {/* Powered by */}
        <p className="text-[10px] text-muted-foreground">
          Decentralised BTC options via Derive Protocol on-chain
        </p>

        {/* Coming Soon button */}
        <button
          disabled
          className="w-full rounded-md bg-amber-500/10 border border-amber-500/20 py-2.5 text-xs font-medium uppercase tracking-wider text-amber-500 cursor-not-allowed"
        >
          Coming Soon
        </button>

        {/* Status */}
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
          <span className="text-muted-foreground">Reduces delta downside from BTC-correlated STRC drawdowns</span>
        </div>
      </div>
    </div>
  );
}
