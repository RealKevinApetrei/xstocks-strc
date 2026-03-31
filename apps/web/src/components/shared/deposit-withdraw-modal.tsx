'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { cn, formatUsd } from '@/lib/utils';

type Mode = 'deposit' | 'withdraw';
type DepositTab = 'ink-chain' | 'qr-code';

// Mock balance — will wire to real Privy smart wallet balance
const MOCK_WALLET_USDC_BALANCE = 0;
const MOCK_PLATFORM_USDC_BALANCE = 0;

export function DepositWithdrawModal({
  mode,
  onClose,
}: {
  mode: Mode;
  onClose: () => void;
}) {
  const { user } = usePrivy();
  const [tab, setTab] = useState<DepositTab>('ink-chain');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const smartWalletAddress = user?.wallet?.address ?? '';
  const availableBalance = mode === 'deposit' ? MOCK_WALLET_USDC_BALANCE : MOCK_PLATFORM_USDC_BALANCE;
  const amountNum = parseFloat(amount) || 0;

  const handleSubmit = async () => {
    if (!amount || amountNum <= 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // TODO: Wire to backend API
      // Deposit: transfer USDC from user's external wallet → Privy smart wallet
      // Withdraw: transfer USDC from Privy smart wallet → user's external wallet
      console.log(`${mode}:`, { amount, smartWalletAddress });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const setPercentage = (pct: number) => {
    setAmount(((availableBalance * pct) / 100).toFixed(2));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 rounded-lg border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">&larr;</button>
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              {mode === 'deposit' ? 'Deposit' : 'Withdraw'}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">&times;</button>
        </div>

        {mode === 'deposit' ? (
          <>
            {/* Deposit tabs */}
            <div className="grid grid-cols-2 mx-4 mt-4 border border-border rounded-md overflow-hidden">
              {([['ink-chain', 'INK CHAIN'], ['qr-code', 'QR CODE']] as const).map(([value, label]) => (
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

            {tab === 'qr-code' ? (
              /* QR Code tab — show smart wallet address */
              <div className="p-6 space-y-4">
                {/* QR Code placeholder */}
                <div className="flex justify-center">
                  <div className="h-48 w-48 rounded-lg bg-white p-3 flex items-center justify-center">
                    <div className="text-black text-[10px] font-mono text-center break-all">
                      {/* TODO: Generate real QR code with a library */}
                      <div className="h-36 w-36 bg-muted rounded grid grid-cols-8 grid-rows-8 gap-0.5 p-1">
                        {Array.from({ length: 64 }).map((_, i) => (
                          <div key={i} className={cn('rounded-sm', Math.random() > 0.5 ? 'bg-black' : 'bg-white')} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground text-center">Trading account deposit address</p>

                {/* Address with copy */}
                <div className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-2">
                  <span className="text-xs font-mono text-muted-foreground flex-1 truncate">
                    {smartWalletAddress || '0x...'}
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(smartWalletAddress)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy address"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  </button>
                </div>

                {/* Info */}
                <div className="space-y-2 text-xs">
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
                    <span className="font-mono">{MOCK_PLATFORM_USDC_BALANCE.toFixed(2)} USDC</span>
                  </div>
                </div>

                {/* Warning */}
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
                  <p className="text-xs text-warning">
                    Only send <span className="font-semibold">USDC</span> on the <span className="font-semibold">Ink</span> network. Deposits of other assets or from other networks will be lost.
                  </p>
                </div>

                <button
                  onClick={onClose}
                  className="w-full rounded-md border border-border bg-secondary py-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                >
                  DONE
                </button>
              </div>
            ) : (
              /* Ink Chain tab — transfer from connected wallet */
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Available in wallet</span>
                  <span className="text-xs font-mono">{availableBalance.toFixed(2)} USDC</span>
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

                <button
                  onClick={handleSubmit}
                  disabled={amountNum <= 0 || isSubmitting}
                  className="w-full rounded-md bg-secondary py-3 text-sm font-medium uppercase tracking-wider text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Processing...' : 'DEPOSIT'}
                </button>
              </div>
            )}
          </>
        ) : (
          /* Withdraw mode */
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Available to withdraw</span>
              <span className="text-xs font-mono">{availableBalance.toFixed(2)} USDC</span>
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

            <p className="text-[10px] text-muted-foreground">
              USDC will be sent to your connected wallet on Ink network.
            </p>

            <button
              onClick={handleSubmit}
              disabled={amountNum <= 0 || isSubmitting}
              className="w-full rounded-md bg-secondary py-3 text-sm font-medium uppercase tracking-wider text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Processing...' : 'WITHDRAW'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
