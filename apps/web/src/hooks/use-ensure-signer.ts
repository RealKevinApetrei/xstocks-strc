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
    console.log('[SIGNER] Hook check:', { ready, authenticated, hasUser: !!user, attempted: attempted.current, keyId: SIGNER_KEY_QUORUM_ID ?? 'NOT SET' });

    if (!ready || !authenticated || !user || attempted.current) return;
    if (!SIGNER_KEY_QUORUM_ID) {
      console.error('[SIGNER] NEXT_PUBLIC_PRIVY_AUTHORIZATION_KEY_ID is not set');
      return;
    }

    const embedded = user.linkedAccounts.find(
      (a) => a.type === 'wallet' && 'walletClientType' in a && a.walletClientType === 'privy',
    );
    if (!embedded || !('address' in embedded)) {
      console.warn('[SIGNER] No embedded wallet found in linked accounts:', user.linkedAccounts.map(a => a.type));
      return;
    }

    console.log('[SIGNER] Adding signer to wallet:', embedded.address, 'keyQuorumId:', SIGNER_KEY_QUORUM_ID);
    attempted.current = true;

    addSessionSigners({
      address: embedded.address as string,
      signers: [{ signerId: SIGNER_KEY_QUORUM_ID }],
    })
      .then(() => console.log('[SIGNER] Authorization key added to wallet successfully'))
      .catch((err) => {
        console.error('[SIGNER] addSessionSigners failed:', err?.message ?? err, err);
      });
  }, [ready, authenticated, user, addSessionSigners]);
}
