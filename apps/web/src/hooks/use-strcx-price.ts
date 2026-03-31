'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

interface StrcxPrice {
  price: number;
  timestamp: number;
  stale: boolean;
  source: string;
}

const FALLBACK_PRICE = 105.42; // Fallback if API unavailable
const POLL_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Hook to fetch the live STRCx/USD price from the backend
 * (sourced from Chainlink Data Streams).
 */
export function useStrcxPrice() {
  const [data, setData] = useState<StrcxPrice>({
    price: FALLBACK_PRICE,
    timestamp: 0,
    stale: true,
    source: 'fallback',
  });

  const fetchPrice = useCallback(async () => {
    try {
      const result = await api.getStrcxPrice();
      if (result.price > 0) {
        setData(result);
      }
    } catch {
      // Keep existing price on error
    }
  }, []);

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchPrice]);

  return data;
}
