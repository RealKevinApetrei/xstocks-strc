'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { cn, formatUsd } from '@/lib/utils';
import { api } from '@/lib/api';
import { PerformanceChart } from '@/components/vaults/performance-chart';

const statusColors: Record<string, string> = {
  COMPLETED: 'text-success bg-success/10 border-success/20',
  COMPLETED_PARTIAL: 'text-warning bg-warning/10 border-warning/20',
  FAILED: 'text-destructive bg-destructive/10 border-destructive/20',
  IN_PROGRESS: 'text-primary bg-primary/10 border-primary/20',
  PENDING: 'text-muted-foreground bg-muted/50 border-border',
};

type Tab = 'history' | 'performance';

interface LoopRecord {
  id: string;
  strcAmount: string;
  targetLeverage: number;
  effectiveLeverage: number | null;
  iterations: number;
  status: string;
  createdAt: string;
}

export function LoopHistory() {
  const { getAccessToken } = usePrivy();
  const [tab, setTab] = useState<Tab>('history');
  const [loops, setLoops] = useState<LoopRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLoops = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const data = await api.getLoopHistory(token, 20, 0);
      setLoops(data.loops);
    } catch {
      // Keep existing data on error
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    fetchLoops();
    const interval = setInterval(fetchLoops, 15_000); // Refresh every 15s
    return () => clearInterval(interval);
  }, [fetchLoops]);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex border-b border-border px-6 pt-4">
        {([['history', 'Loop History'], ['performance', 'Performance']] as const).map(([value, label]) => (
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
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}
            </div>
          ) : loops.length === 0 ? (
            <p className="text-sm text-muted-foreground">No loops yet. Start a loop to get leveraged exposure.</p>
          ) : (
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
                    <tr key={loop.id} className="border-b border-border/50 last:border-0">
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
          )}
        </div>
      ) : (
        <PerformanceChart embedded />
      )}
    </div>
  );
}
