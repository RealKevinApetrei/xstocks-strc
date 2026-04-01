'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useMemo } from 'react';

/**
 * Resolves the user's Privy smart wallet address.
 * Smart wallets are created automatically on login when enabled in Privy Dashboard.
 * Falls back to embedded wallet if smart wallet not yet provisioned.
 */
export function useSmartWallet() {
  const { user, ready, authenticated } = usePrivy();

  const result = useMemo(() => {
    if (!user) return null;

    // Priority 1: Smart wallet (Kernel)
    const sw = user.linkedAccounts.find(
      (a) => a.type === 'smart_wallet',
    );
    if (sw && 'address' in sw) {
      return { address: sw.address as string, type: 'smart_wallet' as const };
    }

    // Priority 2: Embedded wallet (EOA) — fallback if smart wallet not yet created
    const embedded = user.linkedAccounts.find(
      (a) => a.type === 'wallet' && 'walletClientType' in a && a.walletClientType === 'privy',
    );
    if (embedded && 'address' in embedded) {
      return { address: embedded.address as string, type: 'embedded' as const };
    }

    // Priority 3: user.wallet
    if (user.wallet?.address) {
      return { address: user.wallet.address, type: 'wallet' as const };
    }

    return null;
  }, [user]);

  return {
    address: result?.address ?? null,
    type: result?.type ?? null,
    ready: ready && authenticated,
    isSmartWallet: result?.type === 'smart_wallet',
  };
}
