'use client';

const INK_EXPLORER = 'https://explorer.inkonchain.com';

const CONTRACTS = [
  { label: 'STRC Token', address: process.env.NEXT_PUBLIC_STRC_ADDRESS },
  { label: 'wSTRC (Wrapped)', address: process.env.NEXT_PUBLIC_WSTRC_ADDRESS },
  { label: 'USDC', address: process.env.NEXT_PUBLIC_USDC_ADDRESS },
  { label: 'Morpho Blue', address: process.env.NEXT_PUBLIC_MORPHO_ADDRESS },
  { label: 'Morpho Oracle', address: process.env.NEXT_PUBLIC_MORPHO_ORACLE_ADDRESS },
  { label: 'Morpho IRM', address: process.env.NEXT_PUBLIC_MORPHO_IRM_ADDRESS },
].filter((c) => c.address) as Array<{ label: string; address: string }>;

const MARKET_ID = process.env.NEXT_PUBLIC_MORPHO_MARKET_ID ?? '';

export function ContractsPanel({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className={embedded ? 'space-y-4' : 'rounded-lg border border-border bg-card p-6 space-y-4'}>
      {!embedded && (
        <h2 className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
          Info
        </h2>
      )}

      <p className="text-xs text-muted-foreground leading-relaxed">
        Deposit USDC to get leveraged exposure to STRC dividends. Your deposit is looped through Morpho Blue — wrapped into wSTRC, supplied as collateral, USDC borrowed against it, swapped back to STRC, and repeated to reach your target leverage. All execution is automated and non-custodial.
      </p>

      <div className="space-y-2 pt-2 border-t border-border/50">
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

        {MARKET_ID && (
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
        )}
      </div>
    </div>
  );
}
