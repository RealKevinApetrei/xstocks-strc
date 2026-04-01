'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { cn, formatUsd } from '@/lib/utils';
import { api } from '@/lib/api';
import { PerformanceChart } from '@/components/vaults/performance-chart';
import { ContractsPanel } from '@/components/dashboard/contracts-panel';

const statusColors: Record<string, string> = {
  COMPLETED: 'text-success bg-success/10 border-success/20',
  COMPLETED_PARTIAL: 'text-warning bg-warning/10 border-warning/20',
  FAILED: 'text-destructive bg-destructive/10 border-destructive/20',
  IN_PROGRESS: 'text-primary bg-primary/10 border-primary/20',
  PENDING: 'text-muted-foreground bg-muted/50 border-border',
};

type Tab = 'history' | 'performance' | 'info';

const PAGE_SIZE = 10;

interface LoopRecord {
  id: string;
  strcAmount: string;
  targetLeverage: number;
  effectiveLeverage: number | null;
  iterations: number;
  status: string;
  createdAt: string;
}

function HistorySkeleton() {
  return (
    <div className="space-y-0">
      {/* Header skeleton */}
      <div className="flex items-center py-3 border-b border-border">
        {[80, 60, 50, 55, 65, 70].map((w, i) => (
          <div key={i} className="flex-1 flex justify-end first:justify-start">
            <div className="h-3 bg-secondary animate-pulse rounded" style={{ width: w }} />
          </div>
        ))}
      </div>
      {/* Row skeletons */}
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center py-3.5 border-b border-border/50 last:border-0">
          {[70, 55, 35, 40, 30, 65].map((w, j) => (
            <div key={j} className="flex-1 flex justify-end first:justify-start">
              <div
                className="h-4 bg-secondary rounded"
                style={{
                  width: w,
                  opacity: 0.4 + i * 0.1,
                  animation: `pulse 1.5s ease-in-out ${i * 0.1}s infinite`,
                }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function LoopHistory() {
  const { getAccessToken } = usePrivy();
  const [tab, setTab] = useState<Tab>('history');
  const [loops, setLoops] = useState<LoopRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchLoops = useCallback(async (offset = 0) => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const data = await api.getLoopHistory(token, PAGE_SIZE, offset);
      setLoops(data.loops);
      setTotal(data.total);
    } catch {
      // Keep existing data
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    setLoading(true);
    fetchLoops(page * PAGE_SIZE);
    const interval = setInterval(() => fetchLoops(page * PAGE_SIZE), 15_000);
    return () => clearInterval(interval);
  }, [fetchLoops, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex border-b border-border px-6 pt-4">
        {([['history', 'Loop History'], ['performance', 'Performance'], ['info', 'Info']] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              'pb-3 px-1 mr-6 text-xs font-medium transition-colors border-b-2',
              tab === value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'history' ? (
        <div className="p-6">
          {loading ? (
            <HistorySkeleton />
          ) : loops.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">No loops yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Start a loop to get leveraged exposure to STRC dividends.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="py-2 text-left font-medium">Date</th>
                      <th className="py-2 text-right font-medium">USDC</th>
                      <th className="py-2 text-right font-medium">Target</th>
                      <th className="py-2 text-right font-medium">Achieved</th>
                      <th className="py-2 text-right font-medium">Iterations</th>
                      <th className="py-2 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loops.map((loop) => (
                      <tr key={loop.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors">
                        <td className="py-3 text-left font-mono text-xs">
                          {new Date(loop.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 text-right font-mono">
                          {formatUsd(parseFloat(loop.strcAmount) / 1e6)}
                        </td>
                        <td className="py-3 text-right font-mono">{loop.targetLeverage}x</td>
                        <td className="py-3 text-right font-mono text-primary">
                          {loop.effectiveLeverage ? `${loop.effectiveLeverage.toFixed(1)}x` : '—'}
                        </td>
                        <td className="py-3 text-right font-mono">{loop.iterations}</td>
                        <td className="py-3 text-right">
                          <span className={cn(
                            'inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono',
                            statusColors[loop.status] ?? statusColors.PENDING,
                          )}>
                            {loop.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-border/50 mt-4">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="rounded border border-border px-2.5 py-1 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => setPage(i)}
                        className={cn(
                          'rounded border px-2 py-1 text-[10px] font-mono transition-colors',
                          page === i
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
                        )}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="rounded border border-border px-2.5 py-1 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : tab === 'performance' ? (
        <PerformanceChart embedded />
      ) : (
        <div className="p-6">
          <ContractsPanel embedded />
        </div>
      )}
    </div>
  );
}
