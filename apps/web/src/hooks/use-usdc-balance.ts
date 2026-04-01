'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSmartWallet } from './use-smart-wallet';

const INK_RPC   = process.env.NEXT_PUBLIC_INK_RPC || 'https://rpc-gel.inkonchain.com';
const USDC      = '0x2D270e6886d130D724215A266106e6832161EAEd';
const BALANCE_OF_SIG = '0x70a08231';

async function fetchUsdcBalance(walletAddress: string): Promise<number> {
  const paddedAddr = walletAddress.toLowerCase().replace('0x', '').padStart(64, '0');
  const data = BALANCE_OF_SIG + paddedAddr;

  const res = await fetch(INK_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: USDC, data }, 'latest'],
    }),
  });

  const json = await res.json();
  if (json.error) return 0;
  const raw = BigInt(json.result || '0x0');
  return Number(raw) / 1e6; // USDC has 6 decimals
}

export function useUsdcBalance() {
  const { address } = useSmartWallet();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNow = useCallback(async () => {
    if (!address) { setLoading(false); return; }
    try {
      const bal = await fetchUsdcBalance(address);
      setBalance(bal);
    } catch {
      // keep previous
    } finally {
      setLoading(false);
    }
  }, [address]);

  const refresh = useCallback(() => {
    fetchNow();
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
