'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { api, ApiError } from '@/lib/api';

export function UnwindButton({ loopId }: { loopId: string | null }) {
  const { getAccessToken } = usePrivy();
  const [confirming, setConfirming] = useState(false);
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
      await api.startUnwind(token, { loopExecutionId: loopId });
      setUnwindStarted(true);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start unwind');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (confirming) {
    return (
      <div className="rounded-md border border-warning/30 bg-warning/5 p-4 space-y-3">
        <p className="text-xs text-warning font-medium">Are you sure you want to unwind?</p>
        <p className="text-[10px] text-muted-foreground">
          Unwinding is multi-step and not atomic. Price may move during the process.
          This cannot be cancelled once started.
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleUnwind}
            disabled={isSubmitting}
            className="flex-1 rounded-md bg-destructive py-2 text-xs font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
          >
            {isSubmitting ? 'Starting...' : 'Confirm Unwind'}
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
