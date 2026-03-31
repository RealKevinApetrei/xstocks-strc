'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useMemo } from 'react';

/**
 * Resolves the user's Privy smart wallet address.
 * Privy creates a Kernel smart wallet on login.
 * The smart wallet address is the one users should deposit USDC to.
 */
export function useSmartWallet() {
  const { user, ready, authenticated } = usePrivy();

  const smartWallet = useMemo(() => {
    if (!user) return null;

    // Find the smart wallet from linked accounts
    const sw = user.linkedAccounts.find(
      (a) => a.type === 'smart_wallet',
    );
    if (sw && 'address' in sw) {
      return { address: sw.address as string, type: 'smart_wallet' as const };
    }

    // Fallback to embedded wallet (EOA) if smart wallet not yet created
    const embedded = user.linkedAccounts.find(
      (a) => a.type === 'wallet' && 'walletClientType' in a && a.walletClientType === 'privy',
    );
    if (embedded && 'address' in embedded) {
      return { address: embedded.address as string, type: 'embedded' as const };
    }

    // Last resort: user.wallet
    if (user.wallet?.address) {
      return { address: user.wallet.address, type: 'wallet' as const };
    }

    return null;
  }, [user]);

  return {
    address: smartWallet?.address ?? null,
    type: smartWallet?.type ?? null,
    ready: ready && authenticated,
    isSmartWallet: smartWallet?.type === 'smart_wallet',
  };
}
