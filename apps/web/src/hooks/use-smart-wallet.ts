'use client';

import { usePrivy, useCreateWallet } from '@privy-io/react-auth';
import { useMemo, useEffect, useRef } from 'react';

/**
 * Resolves the user's Privy smart wallet address.
 * If no smart wallet exists, attempts to create one.
 * The smart wallet is the trading account where all funds and execution happen.
 */
export function useSmartWallet() {
  const { user, ready, authenticated } = usePrivy();
  const { createWallet } = useCreateWallet();
  const creatingRef = useRef(false);

  const smartWallet = useMemo(() => {
    if (!user) return null;

    // Find the smart wallet from linked accounts
    const sw = user.linkedAccounts.find(
      (a) => a.type === 'smart_wallet',
    );
    if (sw && 'address' in sw) {
      return { address: sw.address as string, type: 'smart_wallet' as const };
    }

    return null;
  }, [user]);

  // Auto-create smart wallet if user is authenticated but doesn't have one
  useEffect(() => {
    if (!ready || !authenticated || !user || smartWallet || creatingRef.current) return;

    // Check if embedded wallet exists (required before smart wallet can be created)
    const hasEmbedded = user.linkedAccounts.some(
      (a) => a.type === 'wallet' && 'walletClientType' in a && a.walletClientType === 'privy',
    );
    if (!hasEmbedded) return;

    creatingRef.current = true;
    createWallet()
      .then((wallet) => {
        console.log('[WALLET] Smart wallet created:', wallet.address);
      })
      .catch((err) => {
        // May already exist or creation not supported
        console.warn('[WALLET] Could not create smart wallet:', err?.message ?? err);
      })
      .finally(() => {
        creatingRef.current = false;
      });
  }, [ready, authenticated, user, smartWallet, createWallet]);

  return {
    address: smartWallet?.address ?? null,
    type: smartWallet?.type ?? null,
    ready: ready && authenticated,
    isSmartWallet: smartWallet?.type === 'smart_wallet',
    loading: ready && authenticated && !smartWallet,
  };
}
