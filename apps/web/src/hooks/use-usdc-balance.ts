'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSmartWallet } from './use-smart-wallet';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS || '';
const INK_RPC = process.env.NEXT_PUBLIC_INK_RPC || 'https://rpc-gel-sepolia.inkonchain.com';

// Minimal ERC20 ABI for balanceOf
const BALANCE_OF_SIG = '0x70a08231';

async function fetchBalance(address: string): Promise<number> {
  // Pad address to 32 bytes
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
  return Number(raw) / 1e6; // USDC has 6 decimals
}

/**
 * Returns USDC balance of the smart wallet (platform balance).
 */
export function useUsdcBalance() {
  const { address } = useSmartWallet();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
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

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { balance, loading, refresh };
}
