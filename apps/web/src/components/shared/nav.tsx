'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { DepositWithdrawModal } from './deposit-withdraw-modal';

const navItems = [
  { href: '/dashboard', label: 'Loop' },
  { href: '/dashboard/vaults', label: 'Strategy Vaults' },
  { href: '/dashboard/savings', label: 'Savings' },
];

export function Nav() {
  const { logout, user } = usePrivy();
  const pathname = usePathname();
  const [modalMode, setModalMode] = useState<'deposit' | 'withdraw' | null>(null);

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
          {/* Deposit / Withdraw buttons */}
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

          {/* Wallet address */}
          <span className="text-xs text-muted-foreground font-mono border border-border rounded-md px-2.5 py-1.5">
            {user?.wallet?.address
              ? `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}`
              : 'No wallet'}
          </span>

          <button
            onClick={logout}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Disconnect
          </button>
        </div>
      </header>

      {/* Deposit/Withdraw Modal */}
      {modalMode && (
        <DepositWithdrawModal mode={modalMode} onClose={() => setModalMode(null)} />
      )}
    </>
  );
}
