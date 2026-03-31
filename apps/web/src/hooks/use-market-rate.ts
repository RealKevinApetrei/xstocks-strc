'use client';

import { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface MarketRate {
  borrowApy: number;
  utilization: number | null;
}

export function useMarketRate() {
  const [data, setData] = useState<MarketRate>({ borrowApy: 4.2, utilization: null });

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/execution/market-rate`);
      if (res.ok) {
        const json = await res.json();
        setData({ borrowApy: json.borrowApy, utilization: json.utilization });
      }
    } catch {
      // Keep fallback
    }
  }, []);

  useEffect(() => {
    fetch_();
    const interval = setInterval(fetch_, 60_000); // Refresh every 60s
    return () => clearInterval(interval);
  }, [fetch_]);

  return data;
}
