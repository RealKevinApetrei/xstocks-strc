'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseUnits,
  formatUnits,
  defineChain,
} from 'viem';

// ─── INK Mainnet ─────────────────────────────────────────────────────────────

const ink = defineChain({
  id: 57073,
  name: 'Ink',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-gel.inkonchain.com'] },
  },
});

// ─── Contract Addresses ───────────────────────────────────────────────────────

const STRC_ADDRESS    = '0x1Aad217B8F78dbA5E6693460e8470F8b1A3977f3' as const;
const WSTRC_ADDRESS   = '0x3b172e9c5488B17A0F4dc6fF4dc798055CC77281' as const;

// ─── ABIs (minimal) ──────────────────────────────────────────────────────────

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
] as const;

const WSTRC_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'wrap', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'strcAmount', type: 'uint256' }],
    outputs: [{ name: 'wstrcAmount', type: 'uint256' }] },
  { name: 'unwrap', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'wstrcAmount', type: 'uint256' }],
    outputs: [{ name: 'strcAmount', type: 'uint256' }] },
  { name: 'strcPerWstrc', type: 'function', stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }] },
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export default function TestPage() {
  const [account, setAccount]         = useState<`0x${string}` | null>(null);
  const [strcBalance, setStrcBalance] = useState('0');
  const [wstrcBalance, setWstrcBalance] = useState('0');
  const [exchangeRate, setExchangeRate] = useState('0');
  const [wrapAmount, setWrapAmount]   = useState('');
  const [unwrapAmount, setUnwrapAmount] = useState('');
  const [status, setStatus]           = useState('');
  const [loading, setLoading]         = useState(false);

  const publicClient = createPublicClient({ chain: ink, transport: http() });

  const refreshBalances = useCallback(async (addr: `0x${string}`) => {
    const [strc, wstrc, rate] = await Promise.all([
      publicClient.readContract({ address: STRC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [addr] }),
      publicClient.readContract({ address: WSTRC_ADDRESS, abi: WSTRC_ABI, functionName: 'balanceOf', args: [addr] }),
      publicClient.readContract({ address: WSTRC_ADDRESS, abi: WSTRC_ABI, functionName: 'strcPerWstrc' }),
    ]);
    setStrcBalance(formatUnits(strc as bigint, 18));
    setWstrcBalance(formatUnits(wstrc as bigint, 18));
    setExchangeRate(formatUnits(rate as bigint, 18));
  }, []);

  const connect = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (window as any).ethereum;
    if (!eth) { setStatus('MetaMask not found'); return; }
    const [addr] = await eth.request({ method: 'eth_requestAccounts' });
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xDED1' }] });
    } catch {
      await eth.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0xDED1', chainName: 'Ink', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc-gel.inkonchain.com'] }] });
    }
    setAccount(addr);
    await refreshBalances(addr);
  };

  const wrap = async () => {
    if (!account || !wrapAmount) return;
    setLoading(true);
    setStatus('Approving STRC...');
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const walletClient = createWalletClient({ chain: ink, transport: custom((window as any).ethereum) });
      const amount = parseUnits(wrapAmount, 18);

      const approveTx = await walletClient.writeContract({
        account, address: STRC_ADDRESS, abi: ERC20_ABI,
        functionName: 'approve', args: [WSTRC_ADDRESS, amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });

      setStatus('Wrapping STRC → wSTRC...');
      const wrapTx = await walletClient.writeContract({
        account, address: WSTRC_ADDRESS, abi: WSTRC_ABI,
        functionName: 'wrap', args: [amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: wrapTx });

      setStatus(`✅ Wrapped ${wrapAmount} STRC → wSTRC`);
      setWrapAmount('');
      await refreshBalances(account);
    } catch (e: unknown) {
      setStatus(`❌ ${e instanceof Error ? e.message : 'Error'}`);
    }
    setLoading(false);
  };

  const unwrap = async () => {
    if (!account || !unwrapAmount) return;
    setLoading(true);
    setStatus('Unwrapping wSTRC → STRC...');
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const walletClient = createWalletClient({ chain: ink, transport: custom((window as any).ethereum) });
      const amount = parseUnits(unwrapAmount, 18);

      const tx = await walletClient.writeContract({
        account, address: WSTRC_ADDRESS, abi: WSTRC_ABI,
        functionName: 'unwrap', args: [amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });

      setStatus(`✅ Unwrapped ${unwrapAmount} wSTRC → STRC`);
      setUnwrapAmount('');
      await refreshBalances(account);
    } catch (e: unknown) {
      setStatus(`❌ ${e instanceof Error ? e.message : 'Error'}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (account) refreshBalances(account);
  }, [account, refreshBalances]);

  // ─── UI ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 gap-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">wSTRC Test</h1>
        <p className="text-zinc-400 mt-1">Wrap and unwrap STRC on INK mainnet</p>
      </div>

      {!account ? (
        <button
          onClick={connect}
          className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg font-semibold transition-colors"
        >
          Connect MetaMask
        </button>
      ) : (
        <div className="w-full max-w-md flex flex-col gap-4">

          {/* Balances */}
          <div className="bg-zinc-900 rounded-xl p-4 flex flex-col gap-2">
            <p className="text-zinc-400 text-sm">Connected: {account.slice(0,6)}...{account.slice(-4)}</p>
            <div className="flex justify-between">
              <span className="text-zinc-400">STRC</span>
              <span className="font-mono">{parseFloat(strcBalance).toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">wSTRC</span>
              <span className="font-mono">{parseFloat(wstrcBalance).toFixed(4)}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-800 pt-2 mt-1">
              <span className="text-zinc-400 text-sm">Exchange rate</span>
              <span className="font-mono text-sm">{parseFloat(exchangeRate).toFixed(6)} STRC/wSTRC</span>
            </div>
            <button
              onClick={() => refreshBalances(account)}
              className="text-xs text-blue-400 hover:text-blue-300 text-right"
            >
              Refresh
            </button>
          </div>

          {/* Wrap */}
          <div className="bg-zinc-900 rounded-xl p-4 flex flex-col gap-3">
            <h2 className="font-semibold">Wrap STRC → wSTRC</h2>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Amount of STRC"
                value={wrapAmount}
                onChange={e => setWrapAmount(e.target.value)}
                className="flex-1 bg-zinc-800 rounded-lg px-3 py-2 outline-none text-sm"
              />
              <button
                onClick={() => setWrapAmount(strcBalance)}
                className="text-xs text-blue-400 hover:text-blue-300 px-2"
              >
                MAX
              </button>
            </div>
            <button
              onClick={wrap}
              disabled={loading || !wrapAmount}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-2 rounded-lg font-semibold transition-colors"
            >
              Wrap
            </button>
          </div>

          {/* Unwrap */}
          <div className="bg-zinc-900 rounded-xl p-4 flex flex-col gap-3">
            <h2 className="font-semibold">Unwrap wSTRC → STRC</h2>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Amount of wSTRC"
                value={unwrapAmount}
                onChange={e => setUnwrapAmount(e.target.value)}
                className="flex-1 bg-zinc-800 rounded-lg px-3 py-2 outline-none text-sm"
              />
              <button
                onClick={() => setUnwrapAmount(wstrcBalance)}
                className="text-xs text-blue-400 hover:text-blue-300 px-2"
              >
                MAX
              </button>
            </div>
            <button
              onClick={unwrap}
              disabled={loading || !unwrapAmount}
              className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 py-2 rounded-lg font-semibold transition-colors"
            >
              Unwrap
            </button>
          </div>

          {/* Status */}
          {status && (
            <div className="bg-zinc-900 rounded-xl p-3 text-sm text-zinc-300 break-all">
              {status}
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-zinc-600 text-center">
        <p>wSTRC: {WSTRC_ADDRESS}</p>
        <p>STRC: {STRC_ADDRESS}</p>
      </div>
    </div>
  );
}
