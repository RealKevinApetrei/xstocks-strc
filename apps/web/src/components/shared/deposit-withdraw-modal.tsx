'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { usePrivy, useSendTransaction } from '@privy-io/react-auth';
import { cn } from '@/lib/utils';
import { useSmartWallet } from '@/hooks/use-smart-wallet';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { api, ApiError } from '@/lib/api';

type Mode = 'deposit' | 'withdraw';
type DepositTab = 'ink-chain' | 'qr-code';

const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS || '';

// ERC20 transfer function selector + encoding
function encodeTransfer(to: string, amount: bigint): string {
  const selector = '0xa9059cbb';
  const paddedTo = to.toLowerCase().replace('0x', '').padStart(64, '0');
  const paddedAmount = amount.toString(16).padStart(64, '0');
  return selector + paddedTo + paddedAmount;
}

export function DepositWithdrawModal({
  mode,
  onClose,
}: {
  mode: Mode;
  onClose: () => void;
}) {
  const { getAccessToken, user } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const { address: smartWalletAddress } = useSmartWallet();
  const { balance: platformBalance, refresh: refreshBalance } = useUsdcBalance();
  const [tab, setTab] = useState<DepositTab>('qr-code');
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const amountNum = parseFloat(amount) || 0;
  const availableBalance = mode === 'withdraw' ? platformBalance : 0;

  // Get the user's external wallet address (for withdraw destination)
  const externalWallet = user?.linkedAccounts.find(
    (a) => a.type === 'wallet' && 'walletClientType' in a && a.walletClientType === 'privy',
  );
  const externalAddress = externalWallet && 'address' in externalWallet ? externalWallet.address as string : null;

  const handleDeposit = async () => {
    if (!amount || amountNum <= 0 || isSubmitting || !smartWalletAddress) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const amountRaw = BigInt(Math.round(amountNum * 1e6));
      const data = encodeTransfer(smartWalletAddress, amountRaw);

      const receipt = await sendTransaction({
        to: USDC_ADDRESS as `0x${string}`,
        data: data as `0x${string}`,
        chainId: 57073,
      });

      setSuccess(`Deposited $${amountNum.toFixed(2)} USDC`);
      setAmount('');
      refreshBalance();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deposit failed';
      if (msg.includes('intrinsic gas too low') || msg.includes('insufficient funds for gas')) {
        setError('Your wallet needs a small amount of ETH on Ink to cover gas fees. Send ETH to your wallet address first, or use the QR Code tab to deposit USDC directly.');
      } else if (msg.includes('insufficient balance') || msg.includes('transfer amount exceeds')) {
        setError('Insufficient USDC balance in your wallet.');
      } else if (msg.includes('rejected') || msg.includes('denied')) {
        setError('Transaction was cancelled.');
      } else {
        setError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const handleSubmit = mode === 'deposit' ? handleDeposit : handleWithdraw;

  const handleCopy = async () => {
    if (!smartWalletAddress) return;
    await navigator.clipboard.writeText(smartWalletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const setPercentage = (pct: number) => {
    if (mode === 'withdraw') {
      setAmount(((platformBalance * pct) / 100).toFixed(2));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

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
              <div className="p-6 space-y-4">
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
              /* Ink Chain tab — transfer USDC from embedded wallet to smart wallet */
              <div className="p-6 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Transfer USDC from your embedded wallet to your trading account.
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="0.00"
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2.5 font-mono text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="flex items-center text-xs text-muted-foreground px-1">USDC</span>
                </div>

                <button
                  onClick={handleDeposit}
                  disabled={amountNum <= 0 || isSubmitting}
                  className="w-full rounded-md bg-primary py-3 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Processing...' : `DEPOSIT $${amountNum > 0 ? amountNum.toFixed(2) : '0.00'}`}
                </button>
              </div>
            )}
          </>
        ) : (
          /* Withdraw mode */
          <div className="p-6 space-y-4">
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
              USDC will be sent to your embedded wallet{externalAddress ? ` (${externalAddress.slice(0, 6)}...${externalAddress.slice(-4)})` : ''} on Ink.
            </p>

            <button
              onClick={handleWithdraw}
              disabled={amountNum <= 0 || amountNum > platformBalance || isSubmitting}
              className="w-full rounded-md bg-primary py-3 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Processing...' : `WITHDRAW $${amountNum > 0 ? amountNum.toFixed(2) : '0.00'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
