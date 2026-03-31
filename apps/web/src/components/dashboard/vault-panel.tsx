'use client';

import { useState } from 'react';
import { cn, formatBigInt } from '@/lib/utils';

export function VaultPanel() {
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');

  // TODO: Wire to useVaultBalance hook
  const mockBalance = {
    assets: '10000000000', // 10,000 USDC (6 decimals)
    shares: '9800000000',
    yieldEarned: '200000000', // $200 yield
  };

  const handleDeposit = async () => {
    // TODO: Wire to api.depositToVault
    console.log('Depositing:', depositAmount);
  };

  const handleWithdraw = async () => {
    // TODO: Wire to api.withdrawFromVault
    console.log('Withdrawing:', withdrawAmount);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">USDC Vault</h2>
        <span className="text-[10px] font-mono text-success bg-success/10 border border-success/20 rounded px-1.5 py-0.5">
          Earning yield via Tydro
        </span>
      </div>

      {/* Balance display */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Balance</div>
          <div className="text-lg font-mono font-semibold">{formatBigInt(mockBalance.assets, 6, 2)} USDC</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Yield Earned</div>
          <div className="text-lg font-mono font-semibold text-success">+{formatBigInt(mockBalance.yieldEarned, 6, 2)} USDC</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['deposit', 'withdraw'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 pb-2 text-xs font-medium transition-colors border-b-2',
              activeTab === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="space-y-3">
        <div className="relative">
          <input
            type="text"
            value={activeTab === 'deposit' ? depositAmount : withdrawAmount}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9.]/g, '');
              activeTab === 'deposit' ? setDepositAmount(val) : setWithdrawAmount(val);
            }}
            placeholder="0.0"
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 font-mono text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">USDC</span>
        </div>

        <button
          onClick={activeTab === 'deposit' ? handleDeposit : handleWithdraw}
          className={cn(
            'w-full rounded-md py-2.5 text-sm font-medium transition-colors',
            activeTab === 'deposit'
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
          )}
        >
          {activeTab === 'deposit' ? 'Deposit to Vault' : 'Withdraw from Vault'}
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Idle USDC earns yield via Tydro. Vault funds are used for automated grid-buy when STRC drops below $103.
      </p>
    </div>
  );
}
