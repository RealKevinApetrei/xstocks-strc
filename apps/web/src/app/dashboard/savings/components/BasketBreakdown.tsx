'use client';

import type { Portfolio } from '../page';

export function BasketBreakdown({ portfolio }: { portfolio: Portfolio }) {
  const { plan } = portfolio;
  if (!plan) return null;

  const { strcPct, tbillPct } = plan;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Basket Allocation</p>

      <div className="space-y-3">
        {/* Visual bar */}
        <div className="h-3 rounded-full overflow-hidden flex">
          <div
            className="bg-primary h-full transition-all duration-500"
            style={{ width: `${strcPct}%` }}
          />
          <div
            className="bg-success/60 h-full transition-all duration-500"
            style={{ width: `${tbillPct}%` }}
          />
        </div>

        {/* Labels */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
            <div>
              <p className="text-sm font-medium">STRC</p>
              <p className="text-xs text-muted-foreground">xStocks · Tokenized stock</p>
            </div>
          </div>
          <span className="text-sm font-semibold">{strcPct}%</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
            <div>
              <p className="text-sm font-medium">Invesco T-Bill</p>
              <p className="text-xs text-muted-foreground">xStocks · Tokenized T-Bill</p>
            </div>
          </div>
          <span className="text-sm font-semibold">{tbillPct}%</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground border-t border-border pt-3">
        Both assets are xStocks on INK chain, swapped via CoW Protocol.
        Markets closed on weekends — deposits queue for Monday open.
      </p>
    </div>
  );
}
