'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { api, ApiError } from '@/lib/api';
import type { UnwindStatusResponse } from '@xstocks/shared';

const POLL_INTERVAL_MS = 5_000;

export function useUnwindStatus(unwindId: string | null) {
  const { getAccessToken } = usePrivy();
  const [data, setData] = useState<UnwindStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!unwindId) return;
    try {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) return;
      const result = await api.getUnwindStatus(token, unwindId);
      setData(result);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [unwindId, getAccessToken]);

  useEffect(() => {
    if (!unwindId) { setData(null); return; }
    fetchStatus();

    const interval = setInterval(async () => {
      if (data?.status === 'COMPLETED' || data?.status === 'FAILED' || data?.status === 'COMPLETED_PARTIAL') return;
      await fetchStatus();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [unwindId, fetchStatus, data?.status]);

  return { data, loading, error };
}
