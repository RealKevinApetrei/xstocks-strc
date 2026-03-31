'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { usePrivy } from '@privy-io/react-auth';
import { SwapWidget } from '@relayprotocol/relay-kit-ui';
import { cn } from '@/lib/utils';
import { useSmartWallet } from '@/hooks/use-smart-wallet';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { api, ApiError } from '@/lib/api';

type Mode = 'deposit' | 'withdraw';
type DepositTab = 'bridge' | 'qr-code';

// USDC on Ink mainnet
const INK_USDC = {
  chainId: 57073,
  address: '0x2d270e6886d130d724215a266106e6832161eaed' as const,
  decimals: 6,
  name: 'USDC',
  symbol: 'USDC',
  logoURI: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png',
};

export function DepositWithdrawModal({
  mode,
  onClose,
}: {
  mode: Mode;
  onClose: () => void;
}) {
  const { getAccessToken, user } = usePrivy();
  const { address: smartWalletAddress } = useSmartWallet();
  const { balance: platformBalance, refresh: refreshBalance } = useUsdcBalance();
  const [tab, setTab] = useState<DepositTab>('bridge');
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const amountNum = parseFloat(amount) || 0;

  // Relay SwapWidget token state
  const [toToken, setToToken] = useState<any>(INK_USDC);
  const [fromToken, setFromToken] = useState<any>(undefined);

  // Get the user's embedded wallet address (for withdraw destination)
  const externalWallet = user?.linkedAccounts.find(
    (a) => a.type === 'wallet' && 'walletClientType' in a && a.walletClientType === 'privy',
  );
  const externalAddress = externalWallet && 'address' in externalWallet ? externalWallet.address as string : null;

  const handleWithdraw = async () => {
    if (!amount || amountNum <= 0 || isSubmitting || !externalAddress) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const amountRaw = BigInt(Math.round(amountNum * 1e6)).toString();
      const result = await api.withdraw(token, amountRaw, externalAddress);

      if (result.success) {
        setSuccess(`Withdrew $${amountNum.toFixed(2)} USDC`);
        setAmount('');
        refreshBalance();
      } else {
        setError('Withdraw transaction failed');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Withdraw failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!smartWalletAddress) return;
    await navigator.clipboard.writeText(smartWalletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const setPercentage = (pct: number) => {
    setAmount(((platformBalance * pct) / 100).toFixed(2));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md mx-4 rounded-lg border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">&larr;</button>
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              {mode === 'deposit' ? 'Deposit' : 'Withdraw'}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">&times;</button>
        </div>

        {/* Status messages */}
        {error && (
          <div className="mx-4 mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}
        {success && (
          <div className="mx-4 mt-4 rounded-md border border-success/30 bg-success/5 p-3">
            <p className="text-xs text-success">{success}</p>
          </div>
        )}

        {mode === 'deposit' ? (
          <>
            {/* Deposit tabs */}
            <div className="grid grid-cols-2 mx-4 mt-4 border border-border rounded-md overflow-hidden">
              {([['bridge', 'CROSS-CHAIN'], ['qr-code', 'QR CODE']] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setTab(value)}
                  className={cn(
                    'py-2 text-xs font-mono font-medium tracking-wider transition-colors',
                    tab === value ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'bridge' ? (
              <div className="p-4">
                <p className="text-xs text-muted-foreground mb-3">
                  Bridge any token from any chain to USDC on Ink. Funds go directly to your trading account.
                </p>
                <div className="relay-widget-container rounded-lg overflow-hidden border border-border">
                  <SwapWidget
                    supportedWalletVMs={['evm']}
                    toToken={toToken}
                    setToToken={setToToken}
                    fromToken={fromToken}
                    setFromToken={setFromToken}
                    lockToToken={true}
                    defaultToAddress={(smartWalletAddress ?? undefined) as `0x${string}` | undefined}
                    defaultAmount="100"
                    onSwapSuccess={() => {
                      setSuccess('Deposit complete — USDC received in your trading account');
                      refreshBalance();
                    }}
                    onSwapError={(err: any) => {
                      setError(err?.message ?? 'Bridge transaction failed');
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                {/* QR Code — encode the smart wallet address */}
                <div className="flex justify-center">
                  <div className="rounded-xl bg-white p-4 shadow-lg">
                    {smartWalletAddress ? (
                      <QRCodeSVG
                        value={smartWalletAddress}
                        size={176}
                        bgColor="#ffffff"
                        fgColor="#000000"
                        level="M"
                      />
                    ) : (
                      <div className="h-44 w-44 flex items-center justify-center">
                        <p className="text-xs text-gray-500">No wallet connected</p>
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground text-center">Trading account deposit address</p>

                {/* Address with copy */}
                <div
                  className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-2.5 cursor-pointer hover:border-foreground/20 transition-colors"
                  onClick={handleCopy}
                >
                  <span className="text-xs font-mono text-muted-foreground flex-1 truncate">
                    {smartWalletAddress || 'Connecting...'}
                  </span>
                  <button className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                    {copied ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success"><path d="M20 6 9 17l-5-5"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                    )}
                  </button>
                </div>

                {/* Info */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Network</span>
                    <span className="font-medium">Ink</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Accepted token</span>
                    <span className="font-medium">USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current balance</span>
                    <span className="font-mono">{platformBalance.toFixed(2)} USDC</span>
                  </div>
                </div>

                {/* Warning */}
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
                  <p className="text-xs text-warning">
                    Only send <span className="font-semibold">USDC</span> on the <span className="font-semibold">Ink</span> network. For other chains or tokens, use the Cross-Chain tab.
                  </p>
                </div>

                <button
                  onClick={onClose}
                  className="w-full rounded-md border border-border bg-secondary py-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                >
                  DONE
                </button>
              </div>
            )}
          </>
        ) : (
          /* Withdraw mode — two options: Ink USDC or cross-chain */
          <div className="p-4">
            <div className="space-y-4 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Available to withdraw</span>
                <span className="text-xs font-mono">{platformBalance.toFixed(2)} USDC</span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2.5 font-mono text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={() => setPercentage(50)}
                  className="rounded-md border border-border px-3 py-2.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
                >
                  50%
                </button>
                <button
                  onClick={() => setPercentage(100)}
                  className="rounded-md border border-border px-3 py-2.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
                >
                  MAX
                </button>
              </div>

              {amountNum > platformBalance && platformBalance > 0 && (
                <p className="text-[10px] text-destructive">Amount exceeds available balance</p>
              )}

              <p className="text-[10px] text-muted-foreground">
                USDC will be sent to your wallet{externalAddress ? ` (${externalAddress.slice(0, 6)}...${externalAddress.slice(-4)})` : ''} on Ink.
              </p>

              <button
                onClick={handleWithdraw}
                disabled={amountNum <= 0 || amountNum > platformBalance || isSubmitting}
                className="w-full rounded-md bg-primary py-3 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Processing...' : `WITHDRAW $${amountNum > 0 ? amountNum.toFixed(2) : '0.00'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
