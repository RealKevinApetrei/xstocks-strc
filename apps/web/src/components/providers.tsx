'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { type ReactNode } from 'react';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '57073');

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#3b82f6',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        defaultChain: {
          id: CHAIN_ID,
          name: 'Ink',
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: { default: { http: [''] } }, // Filled from Privy dashboard
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
