'use client';

const INK_EXPLORER = 'https://explorer.inkonchain.com';

const CONTRACTS = [
  { label: 'STRC Token', address: '0x1aad217b8f78dba5e6693460e8470f8b1a3977f3' },
  { label: 'wSTRC (Wrapped)', address: '0x3b172e9c5488B17A0F4dc6fF4dc798055CC77281' },
  { label: 'USDC', address: '0x2D270e6886d130D724215A266106e6832161EAEd' },
  { label: 'Morpho Blue', address: '0x857f3EefE8cbda3Bc49367C996cd664A880d3042' },
  { label: 'Morpho Oracle', address: '0xDf50EF4D86f056546208c66F9d348b003605eb8E' },
  { label: 'Morpho IRM', address: '0x9515407b1512F53388ffE699524100e7270Ee57B' },
] as const;

const MARKET_ID = '0x036af40bfb700c865a67113be7033830b600eff68b12a8d06c1f57520fccf94a';

export function ContractsPanel() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <h2 className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
        Info
      </h2>

      <div className="space-y-2">
        {CONTRACTS.map(({ label, address }) => (
          <div key={address} className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{label}</span>
            <a
              href={`${INK_EXPLORER}/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-foreground hover:underline underline-offset-2"
            >
              {address.slice(0, 6)}...{address.slice(-4)}
            </a>
          </div>
        ))}

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground">Morpho Market</span>
          <a
            href={`https://app.morpho.org/ink/market?id=${MARKET_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-foreground hover:underline underline-offset-2"
          >
            {MARKET_ID.slice(0, 10)}...{MARKET_ID.slice(-4)}
          </a>
        </div>
      </div>
    </div>
  );
}
