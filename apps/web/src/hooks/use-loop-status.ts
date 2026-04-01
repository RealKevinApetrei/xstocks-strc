'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { api, ApiError } from '@/lib/api';
import type { LoopStatusResponse } from '@xstocks/shared';

const POLL_INTERVAL_MS = 5_000;

export function useLoopStatus(loopId: string | null) {
  const { getAccessToken } = usePrivy();
  const [data, setData] = useState<LoopStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!loopId) return;
    try {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) return;
      const result = await api.getLoopStatus(token, loopId);
      setData(result);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loopId, getAccessToken]);

  useEffect(() => {
    if (!loopId) { setData(null); return; }
    fetchStatus();

    // Only poll while loop is active
    const interval = setInterval(async () => {
      if (data?.status === 'COMPLETED' || data?.status === 'FAILED' || data?.status === 'COMPLETED_PARTIAL') return;
      await fetchStatus();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [loopId, fetchStatus, data?.status]);

  return { data, loading, error };
}
