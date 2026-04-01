'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSmartWallet } from './use-smart-wallet';

const TBILL_ADDRESS = '0x4cbf89ED7Bb30b8a860fa86d3c96E9c72931299b';
const INK_RPC = process.env.NEXT_PUBLIC_INK_RPC || 'https://rpc-gel.inkonchain.com';
const BALANCE_OF_SIG = '0x70a08231';

async function fetchTbillBalance(walletAddress: string): Promise<number> {
  const paddedAddr = walletAddress.toLowerCase().replace('0x', '').padStart(64, '0');
  const res = await fetch(INK_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_call',
      params: [{ to: TBILL_ADDRESS, data: BALANCE_OF_SIG + paddedAddr }, 'latest'],
    }),
  });
  const json = await res.json();
  const hex = json.result;
  if (json.error || !hex || hex === '0x' || hex === '0x0') return 0;
  return Number(BigInt(hex)) / 1e18;
}

async function fetchTbillPrice(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=tbll-xstock&vs_currencies=usd',
      { next: { revalidate: 60 } } as any,
    );
    if (!res.ok) return 100;
    const json = await res.json();
    return json['tbll-xstock']?.usd ?? 100;
  } catch {
    return 100;
  }
}

export function useTbill() {
  const { address } = useSmartWallet();
  const [balance, setBalance] = useState(0);
  const [price, setPrice] = useState(100);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const pricePromise = fetchTbillPrice();
    const balPromise = address ? fetchTbillBalance(address) : Promise.resolve(0);
    const [p, b] = await Promise.all([pricePromise, balPromise]);
    setPrice(p);
    setBalance(b);
    setLoading(false);
  }, [address]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 30_000);
    return () => clearInterval(iv);
  }, [refresh]);

  return { balance, price, usdValue: balance * price, loading, refresh };
}
