'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';

export interface StrcxPriceData {
  price: number;
  timestamp: number;
  stale: boolean;
  source: string;
  change24h: number | null;
  changePct24h: number | null;
  history: Array<{ price: number; timestamp: number }>;
}

const FALLBACK_PRICE = 105.42;
const POLL_INTERVAL_MS = 30_000;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Hook to fetch live STRCx/USD price from Pyth Hermes via SSE,
 * with polling fallback and 24h price history.
 */
export function useStrcxPrice(): StrcxPriceData {
  const [data, setData] = useState<StrcxPriceData>({
    price: FALLBACK_PRICE,
    timestamp: 0,
    stale: true,
    source: 'fallback',
    change24h: null,
    changePct24h: null,
    history: [],
  });
  const sseConnected = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch price history for 24h change calculation + sparkline
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/grid/price/history?hours=24`);
      if (!res.ok) return;
      const { history } = await res.json() as { history: Array<{ price: number; timestamp: number }> };
      if (history.length > 0) {
        setData(prev => {
          const oldest = history[0];
          const change24h = prev.price - oldest.price;
          const changePct24h = oldest.price > 0 ? (change24h / oldest.price) * 100 : null;
          return { ...prev, history, change24h, changePct24h };
        });
      }
    } catch {
      // Keep existing history
    }
  }, []);

  // Polling fallback
  const fetchPrice = useCallback(async () => {
    try {
      const result = await api.getStrcxPrice();
      if (result.price > 0) {
        setData(prev => ({
          ...prev,
          price: result.price,
          timestamp: result.timestamp,
          stale: result.stale,
          source: result.source,
        }));
      }
    } catch {
      // Keep existing price
    }
  }, []);

  useEffect(() => {
    // Try SSE first
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${API_URL}/api/grid/price/stream`);
      es.onmessage = (event) => {
        const { price, timestamp } = JSON.parse(event.data) as { price: number; timestamp: number };
        if (price > 0) {
          sseConnected.current = true;
          setData(prev => {
            const newHistory = [...prev.history, { price, timestamp }].slice(-2880);
            const oldest = newHistory[0];
            const change24h = oldest ? price - oldest.price : null;
            const changePct24h = oldest && oldest.price > 0 ? (change24h! / oldest.price) * 100 : null;
            return {
              ...prev,
              price,
              timestamp,
              stale: false,
              source: 'pyth-hermes-sse',
              history: newHistory,
              change24h,
              changePct24h,
            };
          });
        }
      };
      es.onerror = () => {
        // Fall back to polling if SSE fails
        if (!sseConnected.current && !pollRef.current) {
          fetchPrice();
          pollRef.current = setInterval(fetchPrice, POLL_INTERVAL_MS);
        }
      };
    } catch {
      // SSE not supported, use polling
      fetchPrice();
      pollRef.current = setInterval(fetchPrice, POLL_INTERVAL_MS);
    }

    // Fetch history on mount for initial 24h data
    fetchHistory();
    const historyInterval = setInterval(fetchHistory, 5 * 60_000);

    return () => {
      es?.close();
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(historyInterval);
    };
  }, [fetchPrice, fetchHistory]);

  return data;
}
