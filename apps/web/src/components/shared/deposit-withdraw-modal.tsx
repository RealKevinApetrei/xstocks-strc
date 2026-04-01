'use client';

import { useState, useMemo, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { usePrivy, useSendTransaction, useWallets } from '@privy-io/react-auth';
import { SwapWidget } from '@relayprotocol/relay-kit-ui';
import { adaptViemWallet } from '@relayprotocol/relay-sdk';
import { createWalletClient, custom } from 'viem';
import { cn } from '@/lib/utils';
import { useSmartWallet } from '@/hooks/use-smart-wallet';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { api, ApiError } from '@/lib/api';

type Mode = 'deposit' | 'withdraw';
type Tab = 'bridge' | 'ink' | 'qr-code';

const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x2d270e6886d130d724215a266106e6832161eaed';

const INK_USDC = {
  chainId: 57073,
  address: USDC_ADDRESS,
  decimals: 6,
  name: 'USDC',
  symbol: 'USDC',
  logoURI: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png',
};

function encodeTransfer(to: string, amount: bigint): string {
  const selector = '0xa9059cbb';
  const paddedTo = to.toLowerCase().replace('0x', '').padStart(64, '0');
  const paddedAmount = amount.toString(16).padStart(64, '0');
  return selector + paddedTo + paddedAmount;
}

const DEPOSIT_TABS: { value: Tab; label: string }[] = [
  { value: 'bridge', label: 'CROSS-CHAIN' },
  { value: 'ink', label: 'INK' },
  { value: 'qr-code', label: 'QR CODE' },
];

const WITHDRAW_TABS: { value: Tab; label: string }[] = [
  { value: 'ink', label: 'INK' },
  { value: 'bridge', label: 'CROSS-CHAIN' },
];

export function DepositWithdrawModal({
  mode,
  onClose,
}: {
  mode: Mode;
  onClose: () => void;
}) {
  const { getAccessToken, user } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const { address: smartWalletAddress } = useSmartWallet();

  // Deposits go to smart wallet (where loop executor operates)
  const depositAddress = smartWalletAddress;

  // Adapt Privy embedded wallet for Relay SwapWidget
  const [relayWallet, setRelayWallet] = useState<any>(undefined);
  useEffect(() => {
    const privyWallet = wallets.find(w => w.walletClientType === 'privy');
    if (!privyWallet) return;
    privyWallet.getEthereumProvider().then((provider) => {
      const walletClient = createWalletClient({
        account: privyWallet.address as `0x${string}`,
        transport: custom(provider),
      });
      setRelayWallet(adaptViemWallet(walletClient));
    }).catch(() => {});
  }, [wallets]);
  const { balance: platformBalance, refresh: refreshBalance } = useUsdcBalance();
  const [tab, setTab] = useState<Tab>(mode === 'deposit' ? 'bridge' : 'ink');
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const amountNum = parseFloat(amount) || 0;

  // Relay SwapWidget token state
  // Deposit: toToken locked to USDC on Ink, fromToken user picks
  // Withdraw: fromToken locked to USDC on Ink, toToken user picks (default USDC on Base)
  const [toToken, setToToken] = useState<any>(
    mode === 'withdraw'
      ? { chainId: 8453, address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, name: 'USDC', symbol: 'USDC', logoURI: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png' }
      : INK_USDC,
  );
  const [fromToken, setFromToken] = useState<any>(
    mode === 'withdraw' ? INK_USDC : undefined,
  );

  // Find the user's external wallet (MetaMask etc.), not the Privy embedded wallet
  const externalWallet = user?.linkedAccounts.find(
    (a) => a.type === 'wallet' && 'walletClientType' in a && a.walletClientType !== 'privy',
  );
  // Fall back to embedded wallet if no external wallet connected
  const fallbackWallet = user?.linkedAccounts.find(
    (a) => a.type === 'wallet' && 'walletClientType' in a && a.walletClientType === 'privy',
  );
  const withdrawWallet = externalWallet || fallbackWallet;
  const externalAddress = withdrawWallet && 'address' in withdrawWallet ? withdrawWallet.address as string : null;

  const tabs = mode === 'deposit' ? DEPOSIT_TABS : WITHDRAW_TABS;

  const resetStatus = () => { setError(null); setSuccess(null); };

  // Deposit: transfer USDC from embedded wallet → smart wallet on Ink
  const handleInkDeposit = async () => {
    if (!amount || amountNum <= 0 || isSubmitting || !depositAddress) return;
    setIsSubmitting(true);
    resetStatus();

    try {
      const amountRaw = BigInt(Math.round(amountNum * 1e6));
      const data = encodeTransfer(depositAddress, amountRaw);

      await sendTransaction(
        {
          to: USDC_ADDRESS as `0x${string}`,
          data: data as `0x${string}`,
          chainId: 57073,
        },
        { sponsor: true },
      );

      setSuccess(`Deposited $${amountNum.toFixed(2)} USDC`);
      setAmount('');
      refreshBalance();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deposit failed';
      if (msg.includes('intrinsic gas too low') || msg.includes('insufficient funds for gas')) {
        setError('Your wallet needs ETH on Ink for gas fees. Use the Cross-Chain or QR Code tab instead.');
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

  // Withdraw: transfer USDC from smart wallet → embedded wallet on Ink
  const handleInkWithdraw = async () => {
    if (!amount || amountNum <= 0 || isSubmitting || !externalAddress) return;
    setIsSubmitting(true);
    resetStatus();

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
    if (!depositAddress) return;
    await navigator.clipboard.writeText(depositAddress);
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
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-mono">
              Balance: {platformBalance.toFixed(2)} USDC
            </span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">&times;</button>
          </div>
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

        {/* Tabs */}
        <div className={cn('grid mx-4 mt-4 border border-border rounded-md overflow-hidden', `grid-cols-${tabs.length}`)}>
          {tabs.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { setTab(value); resetStatus(); }}
              className={cn(
                'py-2 text-xs font-mono font-medium tracking-wider transition-colors',
                tab === value ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* === BRIDGE TAB (deposit or withdraw) === */}
        {tab === 'bridge' && (
          <div className="p-4">
            <p className="text-xs text-muted-foreground mb-3">
              {mode === 'deposit'
                ? 'Bridge any token from any chain to USDC on Ink. Funds go directly to your trading account.'
                : 'Bridge USDC from your trading account to any chain.'}
            </p>
            {mode === 'deposit' && depositAddress && (
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2 px-1">
                <span>Recipient (trading account)</span>
                <span className="font-mono">{depositAddress.slice(0, 6)}...{depositAddress.slice(-4)}</span>
              </div>
            )}
            <div className="relay-widget-container rounded-lg overflow-hidden border border-border">
              {mode === 'deposit' ? (
                depositAddress ? (
                  <SwapWidget
                    key={depositAddress}
                    supportedWalletVMs={['evm']}
                    toToken={toToken}
                    setToToken={setToToken}
                    fromToken={fromToken}
                    setFromToken={setFromToken}
                    lockToToken={true}
                    defaultToAddress={depositAddress as `0x${string}`}
                    disablePasteWalletAddressOption={true}
                    popularChainIds={[1, 8453, 42161, 10, 137, 57073]}
                    defaultAmount="100"
                    onSwapSuccess={() => {
                      setSuccess('Deposit complete — USDC received in your trading account');
                      refreshBalance();
                    }}
                    onSwapError={(err: any) => setError(err?.message ?? 'Bridge failed')}
                  />
                ) : (
                  <div className="p-8 text-center space-y-2">
                    <div className="h-4 w-32 mx-auto bg-secondary animate-pulse rounded" />
                    <p className="text-xs text-muted-foreground">Setting up your trading account...</p>
                  </div>
                )
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-3">
                    Bridge USDC from Ink to any chain. Funds are first moved to your wallet, then bridged automatically.
                  </p>
                  <SwapWidget
                    supportedWalletVMs={['evm']}
                    wallet={relayWallet}
                    fromToken={fromToken}
                    setFromToken={setFromToken}
                    toToken={toToken}
                    setToToken={setToToken}
                    lockFromToken={true}
                    defaultAmount={platformBalance > 0 ? platformBalance.toFixed(0) : '100'}
                    onSwapSuccess={() => {
                      setSuccess('Withdrawal bridged successfully');
                      refreshBalance();
                    }}
                    onSwapError={(err: any) => setError(err?.message ?? 'Bridge failed')}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {/* === INK TAB (direct transfer on Ink) === */}
        {tab === 'ink' && (
          <div className="p-6 space-y-4">
            {mode === 'deposit' ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Transfer USDC from your wallet to your trading account on Ink.
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
                  onClick={handleInkDeposit}
                  disabled={amountNum <= 0 || isSubmitting}
                  className="w-full rounded-md bg-primary py-3 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Processing...' : `DEPOSIT $${amountNum > 0 ? amountNum.toFixed(2) : '0.00'}`}
                </button>

                <div className="rounded-md border border-border/50 bg-secondary/50 p-3">
                  <p className="text-[10px] text-muted-foreground">
                    Requires USDC + small ETH for gas in your wallet on Ink. No gas needed? Use the Cross-Chain tab.
                  </p>
                </div>
              </>
            ) : (
              <>
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
                  onClick={handleInkWithdraw}
                  disabled={amountNum <= 0 || amountNum > platformBalance || isSubmitting}
                  className="w-full rounded-md bg-primary py-3 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Processing...' : `WITHDRAW $${amountNum > 0 ? amountNum.toFixed(2) : '0.00'}`}
                </button>
              </>
            )}
          </div>
        )}

        {/* === QR CODE TAB (deposit only) === */}
        {tab === 'qr-code' && (
          <div className="p-6 space-y-4">
            <div className="flex justify-center">
              <div className="rounded-xl bg-white p-4 shadow-lg">
                {depositAddress ? (
                  <QRCodeSVG
                    value={depositAddress}
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
                {depositAddress || 'Connecting...'}
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
            </div>

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
      </div>
    </div>
  );
}
