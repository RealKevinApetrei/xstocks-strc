'use client';

import { cn } from '@/lib/utils';
import { useLoopStatus } from '@/hooks/use-loop-status';

const stepLabels: Record<string, string> = {
  PENDING: 'Preparing...',
  APPROVING: 'Approving tokens...',
  WRAPPING: 'Wrapping STRCx → wSTRC...',
  SUPPLYING: 'Supplying collateral to Morpho...',
  BORROWING: 'Borrowing USDC...',
  SWAPPING: 'Swapping USDC → STRCx via CoW...',
  COMPLETED: 'Done',
  FAILED: 'Failed',
};

const statusColors: Record<string, string> = {
  PENDING: 'border-muted-foreground/30 text-muted-foreground',
  IN_PROGRESS: 'border-primary/50 text-primary',
  COMPLETED: 'border-success/50 text-success',
  COMPLETED_PARTIAL: 'border-warning/50 text-warning',
  FAILED: 'border-destructive/50 text-destructive',
};

export function LoopStatus({ loopId, onClose }: { loopId: string; onClose: () => void }) {
  const { data, loading } = useLoopStatus(loopId);

  const isDone = data?.status === 'COMPLETED' || data?.status === 'COMPLETED_PARTIAL' || data?.status === 'FAILED';

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Loop Progress</h2>
        {data?.status && (
          <span className={cn(
            'text-[10px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded border',
            statusColors[data.status] ?? statusColors.PENDING,
          )}>
            {data.status.replace('_', ' ')}
          </span>
        )}
      </div>

      {loading && !data && (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-muted rounded" />)}
        </div>
      )}

      {data && (
        <>
          {/* Overall stats */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Leverage</span>
              <div className="font-mono font-semibold text-primary mt-0.5">
                {data.effectiveLeverage?.toFixed(1) ?? data.targetLeverage.toFixed(1)}x
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Iterations</span>
              <div className="font-mono font-semibold mt-0.5">
                {data.currentIteration}{data.totalIterations ? `/${data.totalIterations}` : ''}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Health Factor</span>
              <div className={cn('font-mono font-semibold mt-0.5',
                (data.healthFactor ?? 0) > 2 ? 'text-success' : (data.healthFactor ?? 0) > 1.5 ? 'text-warning' : 'text-destructive',
              )}>
                {data.healthFactor?.toFixed(2) ?? '—'}
              </div>
            </div>
          </div>

          {/* Iteration steps */}
          <div className="space-y-2">
            {data.iterations.map((iter) => (
              <div key={iter.number} className="flex items-center gap-3 text-xs">
                <div className={cn(
                  'h-6 w-6 rounded-full border flex items-center justify-center text-[10px] font-mono font-bold shrink-0',
                  iter.status === 'COMPLETED' ? 'border-success bg-success/10 text-success' :
                  iter.status === 'FAILED' ? 'border-destructive bg-destructive/10 text-destructive' :
                  iter.status === 'PENDING' ? 'border-border text-muted-foreground' :
                  'border-primary bg-primary/10 text-primary animate-pulse',
                )}>
                  {iter.status === 'COMPLETED' ? '✓' : iter.status === 'FAILED' ? '✗' : iter.number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-foreground">Iteration {iter.number}</div>
                  <div className="text-muted-foreground truncate">
                    {stepLabels[iter.status] ?? iter.status}
                    {iter.cowOrderUid && iter.status === 'SWAPPING' && ' (waiting for fill...)'}
                  </div>
                </div>
                {iter.slippageBps !== null && (
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    {(iter.slippageBps / 100).toFixed(2)}% slip
                  </span>
                )}
              </div>
            ))}

            {/* Show current active step if no iterations yet */}
            {data.iterations.length === 0 && data.status === 'IN_PROGRESS' && (
              <div className="flex items-center gap-3 text-xs">
                <div className="h-6 w-6 rounded-full border border-primary bg-primary/10 animate-pulse flex items-center justify-center">
                  <span className="text-[10px] text-primary">1</span>
                </div>
                <span className="text-muted-foreground">Starting first iteration...</span>
              </div>
            )}
          </div>

          {/* Error */}
          {data.error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs text-destructive">{data.error}</p>
            </div>
          )}

          {/* Close button when done */}
          {isDone && (
            <button
              onClick={onClose}
              className="w-full rounded-md bg-secondary py-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              {data.status === 'COMPLETED' ? 'Start New Loop' : 'Close'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
