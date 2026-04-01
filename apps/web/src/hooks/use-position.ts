'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSmartWallet } from './use-smart-wallet';
import { api, ApiError } from '@/lib/api';
import type { PositionResponse } from '@xstocks/shared';

const POLL_INTERVAL_MS = 5_000;

export function usePosition() {
  const { getAccessToken } = usePrivy();
  const { address } = useSmartWallet();
  const [data, setData] = useState<PositionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPosition = useCallback(async () => {
    if (!address) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      const result = await api.getPosition(token, address);
      setData(result);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [address, getAccessToken]);

  useEffect(() => {
    fetchPosition();
    const interval = setInterval(fetchPosition, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchPosition]);

  return { data, loading, error, refetch: fetchPosition };
}
