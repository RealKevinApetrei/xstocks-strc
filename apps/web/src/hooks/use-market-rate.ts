'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface MarketRate {
  borrowApy: number | null;
  utilization: number | null;
  loading: boolean;
}

export function useMarketRate(): MarketRate {
  const [borrowApy, setBorrowApy] = useState<number | null>(null);
  const [utilization, setUtilization] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/execution/market-rate`);
      if (res.ok) {
        const json = await res.json();
        if (json.borrowApy !== null && json.borrowApy !== undefined) {
          setBorrowApy(json.borrowApy);
          setUtilization(json.utilization);
          setLoading(false);
          return true; // success
        }
      }
    } catch {
      // will retry
    }
    return false; // failed, need retry
  }, []);

  useEffect(() => {
    let mounted = true;

    const attempt = async (retryDelay: number) => {
      const success = await fetch_();
      if (!mounted) return;
      if (!success) {
        // Retry with backoff (5s, 10s, 15s, then every 15s)
        const nextDelay = Math.min(retryDelay + 5000, 15000);
        retryRef.current = setTimeout(() => attempt(nextDelay), retryDelay);
      } else {
        // Success — poll every 60s for fresh data
        retryRef.current = setTimeout(() => attempt(5000), 60000);
      }
    };

    attempt(5000);

    return () => {
      mounted = false;
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [fetch_]);

  return { borrowApy, utilization, loading };
}
