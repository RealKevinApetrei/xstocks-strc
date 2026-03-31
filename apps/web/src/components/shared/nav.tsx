'use client';

import { usePrivy } from '@privy-io/react-auth';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Loop' },
  { href: '/dashboard/vaults', label: 'Strategy Vaults' },
];

export function Nav() {
  const { logout, user } = usePrivy();
  const pathname = usePathname();

  return (
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
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground font-mono">
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
  );
}
