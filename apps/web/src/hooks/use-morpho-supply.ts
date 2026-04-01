'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSmartWallet } from './use-smart-wallet';

const INK_RPC = process.env.NEXT_PUBLIC_INK_RPC || 'https://rpc-gel.inkonchain.com';
const MORPHO = '0x857f3EefE8cbda3Bc49367C996cd664A880d3042';
// Active market: wSTRC collateral / USDC loan
const MARKET_ID = '036af40bfb700c865a67113be7033830b600eff68b12a8d06c1f57520fccf94a';

// cast sig 'position(bytes32,address)' → 0x93c52062
const POSITION_SIG = '93c52062';
// cast sig 'market(bytes32)' → 0x5c60e39a
const MARKET_SIG = '5c60e39a';

async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(INK_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  const json = await res.json();
  if (json.error || !json.result || json.result === '0x') return '0x';
  return json.result;
}

function decodeSlot(hex: string, slot: number): bigint {
  if (hex === '0x' || hex.length < 2 + (slot + 1) * 64) return 0n;
  const start = 2 + slot * 64;
  return BigInt('0x' + hex.slice(start, start + 64));
}

async function fetchMorphoSupply(address: string): Promise<number> {
  const paddedAddr = address.toLowerCase().replace('0x', '').padStart(64, '0');

  const [posHex, mktHex] = await Promise.all([
    ethCall(MORPHO, '0x' + POSITION_SIG + MARKET_ID + paddedAddr),
    ethCall(MORPHO, '0x' + MARKET_SIG + MARKET_ID),
  ]);

  const supplyShares = decodeSlot(posHex, 0);
  const totalSupplyAssets = decodeSlot(mktHex, 0);
  const totalSupplyShares = decodeSlot(mktHex, 1);

  if (supplyShares === 0n || totalSupplyShares === 0n) return 0;

  // shares → assets (round down for display)
  const supplyAssets = (supplyShares * totalSupplyAssets) / totalSupplyShares;
  return Number(supplyAssets) / 1e6; // USDC: 6 decimals
}

export function useMorphoSupply() {
  const { address } = useSmartWallet();
  const [supplyUsd, setSupplyUsd] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!address) { setLoading(false); return; }
    try {
      const val = await fetchMorphoSupply(address);
      setSupplyUsd(val);
    } catch {}
    setLoading(false);
  }, [address]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 30_000);
    return () => clearInterval(iv);
  }, [refresh]);

  return { supplyUsd, loading, refresh };
}
