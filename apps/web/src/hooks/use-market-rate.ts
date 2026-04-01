'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Singleton store — shared across all components
let borrowApy: number | null = null;
let utilization: number | null = null;
let loading = true;
let listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;

function notify() {
  listeners.forEach((l) => l());
}

async function fetchRate(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/execution/market-rate`);
    if (res.ok) {
      const json = await res.json();
      if (json.borrowApy !== null && json.borrowApy !== undefined) {
        borrowApy = json.borrowApy;
        utilization = json.utilization;
        loading = false;
        notify();
        return true;
      }
    }
  } catch {
    // will retry
  }
  return false;
}

function startPolling() {
  if (intervalId) return;

  const attempt = async (delay: number) => {
    const success = await fetchRate();
    if (listeners.size === 0) return; // no subscribers
    if (!success) {
      retryTimeout = setTimeout(() => attempt(Math.min(delay + 5000, 15000)), delay);
    } else {
      // Success — poll every 60s
      intervalId = setInterval(async () => {
        await fetchRate();
      }, 60_000);
    }
  };

  attempt(2000);
}

function stopPolling() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  if (retryTimeout) { clearTimeout(retryTimeout); retryTimeout = null; }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) startPolling();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopPolling();
  };
}

function getSnapshot() {
  return { borrowApy, utilization, loading };
}

// Stable reference for useSyncExternalStore
let cachedSnapshot = getSnapshot();
function getStableSnapshot() {
  const next = getSnapshot();
  if (next.borrowApy !== cachedSnapshot.borrowApy || next.loading !== cachedSnapshot.loading) {
    cachedSnapshot = next;
  }
  return cachedSnapshot;
}

export function useMarketRate() {
  const snap = useSyncExternalStore(subscribe, getStableSnapshot, getStableSnapshot);
  return snap;
}
