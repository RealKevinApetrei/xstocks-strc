'use client';

import { useWallets } from '@privy-io/react-auth';
import { useMemo } from 'react';

/**
 * Returns the user's active wallet address (smart wallet if available, else embedded EOA).
 * Also exposes `ready` to know when Privy has loaded.
 */
export function useSmartWallet() {
  const { wallets, ready } = useWallets();

  const address = useMemo(() => {
    if (!ready || wallets.length === 0) return null;
    // Prefer smart_wallet type (Kernel EIP-4337)
    const smart = wallets.find((w) => w.walletClientType === 'privy' && (w as any).type === 'smart_wallet');
    if (smart) return smart.address;
    // Fall back to embedded EOA
    const embedded = wallets.find((w) => w.walletClientType === 'privy');
    return embedded?.address ?? null;
  }, [wallets, ready]);

  return { address, ready };
}
