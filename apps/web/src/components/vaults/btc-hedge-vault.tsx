'use client';

import { cn, formatUsd } from '@/lib/utils';

export function BtcHedgeVault() {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden h-full flex flex-col relative">
      {/* Header — visible */}
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
            <span className="text-[9px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-500">
              Coming Soon
            </span>
          </div>
        </div>
      </div>

      {/* Body — blurred */}
      <div className="p-5 space-y-4 flex-1 relative">
        {/* Blur overlay */}
        <div className="absolute inset-0 z-10 backdrop-blur-[6px] bg-card/40 flex flex-col items-center justify-center gap-3 px-6">
          <div className="h-10 w-10 rounded-full border border-amber-500/30 bg-amber-500/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <p className="text-sm font-semibold text-center">BTC Hedging Vault</p>
          <p className="text-xs text-muted-foreground text-center max-w-[280px]">
            Automated OTM puts to reduce delta downside from BTC-correlated STRC drawdowns during volatility events.
          </p>
          <p className="text-[10px] text-muted-foreground text-center mt-1">Launching Q3 2026</p>
        </div>

        {/* Blurred content underneath */}
        <div className="select-none pointer-events-none" aria-hidden>
          {/* Fake vault balance */}
          <div>
            <div className="text-[10px] text-muted-foreground mb-0.5">Protected Notional</div>
            <div className="text-xl font-mono font-semibold">{formatUsd(0)}</div>
          </div>

          {/* Fake strategy info */}
          <div className="rounded-md border border-border bg-background p-3 space-y-2 text-xs mt-4">
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
              <span className="font-mono">Weekly rolling</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max cost</span>
              <span className="font-mono">~0.5% of notional/week</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Downside protection</span>
              <span className="font-mono text-success">Up to 25%</span>
            </div>
          </div>

          {/* Fake deposit/withdraw tabs */}
          <div className="flex border-b border-border mt-4">
            <div className="flex-1 pb-1.5 text-xs font-medium border-b-2 border-primary text-foreground text-center">Deposit</div>
            <div className="flex-1 pb-1.5 text-xs font-medium border-b-2 border-transparent text-muted-foreground text-center">Withdraw</div>
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Wallet</span>
              <span className="font-mono">$0.00</span>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-muted-foreground">
              0.0
            </div>
            <div className={cn(
              'w-full rounded-md py-2 text-xs font-medium text-center',
              'bg-primary/30 text-primary-foreground/50 cursor-not-allowed',
            )}>
              Deposit
            </div>
          </div>

          {/* Fake hedge status */}
          <div className="flex items-center gap-1.5 text-[10px] mt-3">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">Inactive — deposit to activate hedge</span>
          </div>
        </div>
      </div>
    </div>
  );
}
