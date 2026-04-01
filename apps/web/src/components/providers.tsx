'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { type ReactNode } from 'react';
import { defineChain, http } from 'viem';
import { mainnet, base, arbitrum, optimism } from 'viem/chains';
import { createConfig, WagmiProvider } from 'wagmi';
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

// Minimal wagmi config for Relay widget (Privy manages actual wallet connections)
const wagmiConfig = createConfig({
  chains: [mainnet, base, arbitrum, optimism, ink],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [ink.id]: http('https://rpc-gel.inkonchain.com'),
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
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
      </WagmiProvider>
    </QueryClientProvider>
  );
}
