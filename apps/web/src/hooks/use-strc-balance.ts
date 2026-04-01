'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSmartWallet } from './use-smart-wallet';

const STRC_ADDRESS = process.env.NEXT_PUBLIC_STRC_ADDRESS || '';
const WSTRC_ADDRESS = process.env.NEXT_PUBLIC_WSTRC_ADDRESS || '';
const INK_RPC = process.env.NEXT_PUBLIC_INK_RPC || 'https://rpc-gel.inkonchain.com';

const BALANCE_OF_SIG = '0x70a08231';

async function fetchBalance(tokenAddress: string, walletAddress: string): Promise<bigint> {
  const paddedAddr = walletAddress.toLowerCase().replace('0x', '').padStart(64, '0');
  const data = BALANCE_OF_SIG + paddedAddr;

  const res = await fetch(INK_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_call',
      params: [{ to: tokenAddress, data }, 'latest'],
    }),
  });

  const json = await res.json();
  if (json.error) return 0n;
  return BigInt(json.result || '0x0');
}

export function useStrcBalance() {
  const { address } = useSmartWallet();
  const [balance, setBalance] = useState(0n);
  const [wstrcBalance, setWstrcBalance] = useState(0n);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!address || !STRC_ADDRESS) { setLoading(false); return; }
    try {
      const [bal, wbal] = await Promise.all([
        fetchBalance(STRC_ADDRESS, address),
        WSTRC_ADDRESS ? fetchBalance(WSTRC_ADDRESS, address) : Promise.resolve(0n),
      ]);
      setBalance(bal);
      setWstrcBalance(wbal);
    } catch {}
    setLoading(false);
  }, [address]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 30_000);
    return () => clearInterval(iv);
  }, [refresh]);

  // Human-readable (18 decimals)
  const formatted = Number(balance) / 1e18;
  const wstrcFormatted = Number(wstrcBalance) / 1e18;
  // Total includes both unwrapped and wrapped STRC
  const totalFormatted = formatted + wstrcFormatted;

  return { balance, wstrcBalance, formatted, wstrcFormatted, totalFormatted, loading, refresh };
}
