'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { type ReactNode } from 'react';
import { defineChain } from 'viem';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RelayKitProvider } from '@relayprotocol/relay-kit-ui';
import { MAINNET_RELAY_API } from '@relayprotocol/relay-sdk';
import '@relayprotocol/relay-kit-ui/styles.css';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;

const ink = defineChain({
  id: 57073,
  name: 'Ink',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-gel.inkonchain.com'] },
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RelayKitProvider
        options={{
          appName: 'xStocks',
          baseApiUrl: MAINNET_RELAY_API,
        }}
      >
        <PrivyProvider
          appId={PRIVY_APP_ID}
          config={{
            appearance: {
              theme: 'dark',
              accentColor: '#3b82f6',
            },
            embeddedWallets: {
              createOnLogin: 'all-users',
            },
            defaultChain: ink,
            supportedChains: [ink],
          }}
        >
          {children}
        </PrivyProvider>
      </RelayKitProvider>
    </QueryClientProvider>
  );
}
