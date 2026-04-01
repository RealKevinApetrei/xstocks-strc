'use client';

import type { Portfolio } from '../page';

const TIER_COLORS = {
  BRONZE: { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/20' },
  SILVER: { bg: 'bg-slate-400/10', text: 'text-slate-400', border: 'border-slate-400/20' },
  GOLD: { bg: 'bg-yellow-400/10', text: 'text-yellow-400', border: 'border-yellow-400/20' },
};

const TIER_NEXT: Record<string, string> = {
  BRONZE: '3-month streak → Silver',
  SILVER: '6-month streak → Gold',
  GOLD: 'Maximum tier reached',
};

export function ProgressCard({ portfolio }: { portfolio: Portfolio }) {
  const { plan, portfolio: pf, thisMonth } = portfolio;
  if (!plan) return null;

  const tier = plan.tier;
  const colors = TIER_COLORS[tier];

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-5">
      {/* Top row: value + tier */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Portfolio Value</p>
          <p className="text-3xl font-semibold mt-1">
            ${pf.portfolioValueUsd.toFixed(2)}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-xs ${pf.yieldToDateUsd >= 0 ? 'text-success' : 'text-destructive'}`}>
              {pf.yieldToDateUsd >= 0 ? '+' : ''}{pf.yieldToDateUsd.toFixed(2)} yield
            </span>
            <span className="text-xs text-muted-foreground">
              from ${pf.totalDepositedUsd.toFixed(2)} deposited
            </span>
          </div>
        </div>

        <div className={`flex flex-col items-center rounded-lg border px-4 py-2 ${colors.bg} ${colors.border}`}>
          <span className={`text-lg font-bold ${colors.text}`}>{tier}</span>
          <span className="text-[10px] text-muted-foreground mt-0.5">{plan.streakMonths}mo streak</span>
        </div>
      </div>

      {/* Monthly goal progress */}
      {thisMonth && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground uppercase tracking-wider">This Month</span>
            <span className={thisMonth.goalMet ? 'text-success font-medium' : 'text-muted-foreground'}>
              ${thisMonth.depositedUsdc.toFixed(0)} / ${thisMonth.targetUsdc.toFixed(0)}
              {thisMonth.goalMet && ' ✓'}
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${thisMonth.goalMet ? 'bg-success' : 'bg-primary'}`}
              style={{ width: `${thisMonth.progressPct}%` }}
            />
          </div>
          {!thisMonth.goalMet && (
            <p className="text-xs text-muted-foreground">
              ${(thisMonth.targetUsdc - thisMonth.depositedUsdc).toFixed(2)} more to hit goal this month
            </p>
          )}
        </div>
      )}

      {/* Next tier */}
      <p className="text-xs text-muted-foreground border-t border-border pt-3">
        {TIER_NEXT[tier]}
        {tier !== 'GOLD' && pf.rewardMultiplier > 1 && (
          <span className="text-primary ml-1">· {pf.rewardMultiplier}× rewards</span>
        )}
      </p>
    </div>
  );
}
