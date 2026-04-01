'use client';

import { useState, useRef, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useMarketRate } from '@/hooks/use-market-rate';
import { DepositWithdrawModal } from './deposit-withdraw-modal';
import { useSmartWallet } from '@/hooks/use-smart-wallet';

const navItems = [
  { href: '/dashboard', label: 'Loop' },
  { href: '/dashboard/vaults', label: 'Strategy Vaults' },
  { href: '/dashboard/savings', label: 'Stretch Your Savings' },
];

export function Nav() {
  const { logout } = usePrivy();
  const { address: smartWalletAddress } = useSmartWallet();
  const pathname = usePathname();
  const { borrowApy } = useMarketRate();
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

  // Listen for deposit/withdraw triggers from other pages
  useEffect(() => {
    const depositHandler = () => setModalMode('deposit');
    const withdrawHandler = () => setModalMode('withdraw');
    document.addEventListener('open-deposit-modal', depositHandler);
    document.addEventListener('open-withdraw-modal', withdrawHandler);
    return () => {
      document.removeEventListener('open-deposit-modal', depositHandler);
      document.removeEventListener('open-withdraw-modal', withdrawHandler);
    };
  }, []);

  const handleCopyAddress = async () => {
    if (smartWalletAddress) {
      await navigator.clipboard.writeText(smartWalletAddress);
    }
    setWalletMenuOpen(false);
  };

  return (
    <>
      <header className="border-b border-border bg-card px-6 flex items-center justify-between h-[52px]">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2">
            {/* Official Spreads logo mark — polygon paths from master SVG */}
            <svg width="14" height="18" viewBox="415 379 250 322" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <polygon fill="#1a3520" points="416.8 476.1 525.8 476.4 602 379.7 663.9 380.4 664.2 380.7 662.9 484.1 537.5 484 473 581.2 415.8 580.8 416.8 476.1"/>
              <polygon fill="#1a3520" points="416.8 605.1 525.8 605.4 591.9 508.8 664.2 508.8 662.9 610.4 537.5 613 483 700.3 415.8 699.9 416.8 605.1"/>
            </svg>
            <span className="text-sm font-semibold tracking-widest uppercase text-foreground">Spreads</span>
          </Link>
          {/* Nav links — active state is underline, not a pill */}
          <nav className="flex items-stretch h-[52px]">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center px-4 text-xs font-medium tracking-wide uppercase transition-colors border-b-2',
                  pathname === item.href
                    ? 'text-foreground border-foreground'
                    : 'text-muted-foreground border-transparent hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* STRC Yield stat — live from market rate */}
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 bg-secondary">
            <span className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">STRC Yield</span>
            <span className="text-xs font-mono font-semibold text-success">+11.5%</span>
          </div>
          {/* Portfolio link */}
          <Link
            href="/dashboard/portfolio"
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
              pathname === '/dashboard/portfolio'
                ? 'border-foreground/40 bg-secondary text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary',
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
            PORTFOLIO
          </Link>
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
