'use client';

import { useState, useEffect, useCallback } from 'react';

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

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/execution/market-rate`);
      if (res.ok) {
        const json = await res.json();
        setBorrowApy(json.borrowApy);
        setUtilization(json.utilization);
      }
    } catch {
      // keep null
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
    const interval = setInterval(fetch_, 60_000);
    return () => clearInterval(interval);
  }, [fetch_]);

  return { borrowApy, utilization, loading };
}
