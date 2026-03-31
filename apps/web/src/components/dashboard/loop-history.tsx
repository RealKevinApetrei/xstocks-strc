'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PerformanceChart } from '@/components/vaults/performance-chart';

// TODO: Wire to real data from API
const mockHistory = [
  { id: '1', date: '2025-03-28', strcAmount: '1000', leverage: '2.5x', iterations: 3, status: 'COMPLETED' as const },
  { id: '2', date: '2025-03-29', strcAmount: '500', leverage: '3.0x', iterations: 2, status: 'COMPLETED_PARTIAL' as const },
];

const statusColors: Record<string, string> = {
  COMPLETED: 'text-success bg-success/10 border-success/20',
  COMPLETED_PARTIAL: 'text-warning bg-warning/10 border-warning/20',
  FAILED: 'text-destructive bg-destructive/10 border-destructive/20',
  IN_PROGRESS: 'text-primary bg-primary/10 border-primary/20',
  PENDING: 'text-muted-foreground bg-muted/50 border-border',
};

type Tab = 'history' | 'performance';

export function LoopHistory() {
  const [tab, setTab] = useState<Tab>('history');

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Tabs */}
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
          {mockHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No loops yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-2 text-left font-medium">Date</th>
                    <th className="py-2 text-right font-medium">STRC</th>
                    <th className="py-2 text-right font-medium">Leverage</th>
                    <th className="py-2 text-right font-medium">Iterations</th>
                    <th className="py-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {mockHistory.map((loop) => (
                    <tr key={loop.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 text-left font-mono text-xs">{loop.date}</td>
                      <td className="py-3 text-right font-mono">{loop.strcAmount}</td>
                      <td className="py-3 text-right font-mono text-primary">{loop.leverage}</td>
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
