'use client';

import { useState, useRef, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { DepositWithdrawModal } from './deposit-withdraw-modal';
import { useSmartWallet } from '@/hooks/use-smart-wallet';

const navItems = [
  { href: '/dashboard', label: 'Loop' },
  { href: '/dashboard/vaults', label: 'Strategy Vaults' },
];

export function Nav() {
  const { logout } = usePrivy();
  const { address: smartWalletAddress } = useSmartWallet();
  const pathname = usePathname();
  const [modalMode, setModalMode] = useState<'deposit' | 'withdraw' | null>(null);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setWalletMenuOpen(false);
      }
    }
    if (walletMenuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [walletMenuOpen]);

  const handleCopyAddress = async () => {
    if (smartWalletAddress) {
      await navigator.clipboard.writeText(smartWalletAddress);
    }
    setWalletMenuOpen(false);
  };

  return (
    <>
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="text-lg font-semibold">
            x<span className="text-primary">Stocks</span>
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  pathname === item.href
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setModalMode('deposit')}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
            DEPOSIT
          </button>
          <button
            onClick={() => setModalMode('withdraw')}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
            WITHDRAW
          </button>

          {/* Wallet button with dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setWalletMenuOpen(!walletMenuOpen)}
              className={cn(
                'text-xs font-mono border rounded-md px-2.5 py-1.5 transition-colors',
                walletMenuOpen
                  ? 'border-primary/40 bg-secondary text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
              )}
            >
              {smartWalletAddress
                ? `${smartWalletAddress.slice(0, 6)}...${smartWalletAddress.slice(-4)}`
                : 'No wallet'}
            </button>

            {walletMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 rounded-md border border-border bg-card shadow-xl z-50 overflow-hidden">
                <button
                  onClick={handleCopyAddress}
                  className="w-full px-3 py-2.5 text-left text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  Copy address
                </button>
                <div className="border-t border-border" />
                <button
                  onClick={() => { logout(); setWalletMenuOpen(false); }}
                  className="w-full px-3 py-2.5 text-left text-xs text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {modalMode && (
        <DepositWithdrawModal mode={modalMode} onClose={() => setModalMode(null)} />
      )}
    </>
  );
}
