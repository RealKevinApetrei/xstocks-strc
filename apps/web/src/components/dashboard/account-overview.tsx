'use client';

import { cn, formatUsd } from '@/lib/utils';

// Mock data — wire to real balances
const MOCK_TTV = 527_000; // Total terminal value in USD
const MOCK_24H_CHANGE = 12_400;
const MOCK_24H_PCT = 2.4;

export function AccountOverview() {
  const isPositive = MOCK_24H_CHANGE >= 0;

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
            Terminal Total Value (TTV)
          </div>
          <div className="text-4xl font-mono font-bold tracking-tight">
            {formatUsd(MOCK_TTV)}
          </div>
          <div className={cn('text-sm font-mono mt-1', isPositive ? 'text-success' : 'text-destructive')}>
            24H {isPositive ? '+' : ''}{formatUsd(MOCK_24H_CHANGE)} ({isPositive ? '+' : ''}{MOCK_24H_PCT.toFixed(1)}%)
          </div>
        </div>
      </div>
    </div>
  );
}
