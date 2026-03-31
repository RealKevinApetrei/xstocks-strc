'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const { login, authenticated, ready } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && authenticated) {
      router.push('/dashboard');
    }
  }, [ready, authenticated, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold tracking-tight">
          x<span className="text-primary">Stocks</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-md">
          Leveraged STRC looping on Morpho with automated buy-the-dip strategy
        </p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <button
          onClick={login}
          disabled={!ready}
          className="rounded-lg bg-primary px-8 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {ready ? 'Connect Wallet' : 'Loading...'}
        </button>
        <p className="text-xs text-muted-foreground">
          Ink Chain (57073) &middot; Powered by Morpho &amp; CoW Protocol
        </p>
      </div>
    </main>
  );
}
