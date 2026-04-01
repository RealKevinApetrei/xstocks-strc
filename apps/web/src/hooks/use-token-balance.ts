'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSmartWallet } from './use-smart-wallet';

const INK_RPC = process.env.NEXT_PUBLIC_INK_RPC || 'https://rpc-gel.inkonchain.com';
const BALANCE_OF_SIG = '0x70a08231';

async function fetchTokenBalance(walletAddress: string, tokenAddress: string): Promise<number> {
  if (!tokenAddress) return 0;
  const paddedAddr = walletAddress.toLowerCase().replace('0x', '').padStart(64, '0');
  const data = BALANCE_OF_SIG + paddedAddr;

  const res = await fetch(INK_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: tokenAddress, data }, 'latest'],
    }),
  });

  const json = await res.json();
  if (json.error) return 0;
  const raw = BigInt(json.result || '0x0');
  // Both STRC and T-Bill use 18 decimals
  return Number(raw) / 1e18;
}

/**
 * Read on-chain balance of any ERC-20 token for the user's smart wallet.
 * Same pattern as useUsdcBalance but parameterized.
 */
export function useTokenBalance(tokenAddress: string) {
  const { address } = useSmartWallet();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNow = useCallback(async () => {
    if (!address || !tokenAddress) { setLoading(false); return; }
    try {
      const bal = await fetchTokenBalance(address, tokenAddress);
      setBalance(bal);
    } catch {
      // keep previous
    } finally {
      setLoading(false);
    }
  }, [address, tokenAddress]);

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
