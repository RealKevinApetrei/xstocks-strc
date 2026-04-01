'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@/lib/api';

const UNWIND_OPTIONS = [
  { value: 0, label: 'Full (USDC)', description: 'Close position entirely, receive USDC' },
  { value: 1, label: '1x (Hold STRC)', description: 'Remove all leverage, keep STRC exposure' },
  { value: 2, label: '2x', description: 'Reduce to 2x leverage' },
  { value: 3, label: '3x', description: 'Reduce to 3x leverage' },
  { value: 3.5, label: '3.5x', description: 'Reduce to 3.5x leverage' },
] as const;

export function UnwindButton({ loopId, currentLeverage }: { loopId: string | null; currentLeverage?: number }) {
  const { getAccessToken } = usePrivy();
  const [confirming, setConfirming] = useState(false);
  const [targetLeverage, setTargetLeverage] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unwindStarted, setUnwindStarted] = useState(false);

  if (!loopId || unwindStarted) return null;

  const handleUnwind = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      await api.startUnwind(token, { loopExecutionId: loopId, targetLeverage } as any);
      setUnwindStarted(true);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start unwind');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter options: only show targets below current leverage
  const availableOptions = UNWIND_OPTIONS.filter(
    (opt) => !currentLeverage || opt.value < currentLeverage,
  );

  if (confirming) {
    return (
      <div className="rounded-md border border-warning/30 bg-warning/5 p-4 space-y-4">
        <div>
          <p className="text-xs font-medium text-warning">Unwind Position</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Multi-step process. Price may move during execution. Cannot be cancelled once started.
          </p>
        </div>

        {/* Target leverage selector */}
        <div className="space-y-2">
          <label className="text-[10px] text-muted-foreground">Unwind to:</label>
          <div className="grid grid-cols-2 gap-1.5">
            {availableOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTargetLeverage(opt.value)}
                className={cn(
                  'rounded-md border py-2 px-2 text-left transition-all',
                  targetLeverage === opt.value
                    ? 'border-warning bg-warning/10'
                    : 'border-border hover:border-warning/30',
                )}
              >
                <div className="text-xs font-mono font-semibold">{opt.label}</div>
                <div className="text-[9px] text-muted-foreground">{opt.description}</div>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={handleUnwind}
            disabled={isSubmitting}
            className="flex-1 rounded-md bg-destructive py-2 text-xs font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
          >
            {isSubmitting ? 'Starting...' : `Confirm ${targetLeverage === 0 ? 'Full Unwind' : `Unwind to ${targetLeverage}x`}`}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="flex-1 rounded-md bg-secondary py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="w-full rounded-md border border-destructive/30 py-2 text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors"
    >
      Unwind Position
    </button>
  );
}
