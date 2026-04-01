'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSmartWallet } from './use-smart-wallet';

const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS || '';
const INK_RPC = process.env.NEXT_PUBLIC_INK_RPC || 'https://rpc-gel.inkonchain.com';

const BALANCE_OF_SIG = '0x70a08231';

async function fetchBalance(address: string): Promise<number> {
  const paddedAddr = address.toLowerCase().replace('0x', '').padStart(64, '0');
  const data = BALANCE_OF_SIG + paddedAddr;

  const res = await fetch(INK_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: USDC_ADDRESS, data }, 'latest'],
    }),
  });

  const json = await res.json();
  if (json.error) return 0;
  const raw = BigInt(json.result || '0x0');
  return Number(raw) / 1e6;
}

/**
 * Returns USDC balance of the smart wallet (platform balance).
 * Call refresh() after transactions — it fetches immediately + again after 5s
 * to catch UserOp confirmation delays.
 */
export function useUsdcBalance() {
  const { address } = useSmartWallet();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNow = useCallback(async () => {
    if (!address || !USDC_ADDRESS) { setLoading(false); return; }
    try {
      const bal = await fetchBalance(address);
      setBalance(bal);
    } catch {
      // keep previous
    } finally {
      setLoading(false);
    }
  }, [address]);

  // Refresh with delayed re-fetch to catch UserOp mining
  const refresh = useCallback(() => {
    fetchNow();
    // Re-fetch after 3s and 8s to catch UserOp confirmation
    setTimeout(fetchNow, 3000);
    setTimeout(fetchNow, 8000);
  }, [fetchNow]);

  useEffect(() => {
    fetchNow();
    const interval = setInterval(fetchNow, 15_000);
    return () => clearInterval(interval);
  }, [fetchNow]);

  return { balance, loading, refresh };
}
