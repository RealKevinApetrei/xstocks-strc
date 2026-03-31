'use client';

import { usePrivy, useSessionSigners } from '@privy-io/react-auth';
import { useEffect, useRef } from 'react';

const SIGNER_KEY_QUORUM_ID = process.env.NEXT_PUBLIC_PRIVY_AUTHORIZATION_KEY_ID!;

/**
 * Ensures the server authorization key is registered as a signer on the user's
 * embedded wallet. Runs once per session after login.
 */
export function useEnsureSigner() {
  const { user, ready, authenticated } = usePrivy();
  const { addSessionSigners } = useSessionSigners();
  const attempted = useRef(false);

  useEffect(() => {
    if (!ready || !authenticated || !user || attempted.current) return;
    if (!SIGNER_KEY_QUORUM_ID) return;

    const embedded = user.linkedAccounts.find(
      (a) => a.type === 'wallet' && 'walletClientType' in a && a.walletClientType === 'privy',
    );
    if (!embedded || !('address' in embedded)) return;

    attempted.current = true;

    addSessionSigners({
      address: embedded.address as string,
      signers: [{ signerId: SIGNER_KEY_QUORUM_ID }],
    })
      .then(() => console.log('[SIGNER] Authorization key added to wallet'))
      .catch((err) => {
        // Already added or other non-fatal error
        console.warn('[SIGNER] addSessionSigners:', err?.message ?? err);
      });
  }, [ready, authenticated, user, addSessionSigners]);
}
