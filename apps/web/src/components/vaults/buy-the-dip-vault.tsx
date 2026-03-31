'use client';

import { useState, useEffect, useRef } from 'react';
import { cn, formatUsd } from '@/lib/utils';

// ─── Constants ─────────────────────────────────────────────────────────────────
const STRC_PRICE_USD    = 105.42;
const TRIGGER_PRICE     = 95;       // Buy when STRC drops below this
const VAULT_BALANCE: number = 10000;    // USDC in vault
const VAULT_YIELD_START = 200.47162; // Yield already earned (start ticking from here)
const TYDRO_APY         = 5.2;      // % APY from Tydro while waiting
const WALLET_USDC       = 2400;     // User's available USDC (mock)

// Per 500ms yield increment: balance * APY / (365 * 86400 * 2)
const YIELD_PER_HALF_SEC = (VAULT_BALANCE * (TYDRO_APY / 100)) / (365 * 86400 * 2);

// ─── Helpers ────────────────────────────────────────────────────────────────────
function formatYield(val: number): string {
  // Show 5 decimal places so the last digit visibly ticks
  return '$' + val.toFixed(5);
}

function formatRunway(pct: number): string {
  if (pct >= 100) return '1 dip (all-in)';
  const n = Math.floor(100 / pct);
  return `${n} dips`;
}

// ─── Component ──────────────────────────────────────────────────────────────────
export function BuyTheDipVault() {
  const [depositAmount, setDepositAmount]   = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [activeTab, setActiveTab]           = useState<'deposit' | 'withdraw'>('deposit');
  const [deployPct, setDeployPct]           = useState(25);
  const [strategyOn, setStrategyOn]         = useState(true);
  const [showToggleTip, setShowToggleTip]   = useState(false);
  const [yieldEarned, setYieldEarned]       = useState(VAULT_YIELD_START);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  // ── Yield ticker animation ─────────────────────────────────────────────────
  const yieldRef = useRef(VAULT_YIELD_START);
  useEffect(() => {
    if (!strategyOn || VAULT_BALANCE === 0) return;
    const id = setInterval(() => {
      yieldRef.current += YIELD_PER_HALF_SEC;
      setYieldEarned(yieldRef.current);
    }, 500);
    return () => clearInterval(id);
  }, [strategyOn]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const distancePct  = ((STRC_PRICE_USD - TRIGGER_PRICE) / STRC_PRICE_USD) * 100;
  // Gauge fill: 0% = at trigger, 100% = 30% above trigger
  const gaugeFill    = Math.min(100, Math.max(0, (distancePct / 30) * 100));
  const yieldPerDay  = (VAULT_BALANCE * (TYDRO_APY / 100)) / 365;

  // Preview: recalculates as user types in deposit field
  const previewBalance = Math.max(
    VAULT_BALANCE,
    parseFloat(activeTab === 'deposit' ? depositAmount : '0') || 0,
  );
  const deployAmount   = previewBalance * (deployPct / 100);
  const strcPerTrigger = deployAmount / TRIGGER_PRICE;
  const runway         = deployPct >= 100 ? 1 : Math.floor(100 / deployPct);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-6 pt-5 pb-4 border-b border-border">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-lg">
              $
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">Buy the Dip Vault</h2>
                <span className={cn(
                  'text-[10px] font-medium rounded-full px-2 py-0.5 border',
                  strategyOn
                    ? 'bg-success/10 text-success border-success/20'
                    : 'bg-muted text-muted-foreground border-border',
                )}>
                  {strategyOn ? '● Active' : '⏸ Paused'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Idle USDC earns yield via Tydro · auto-buys STRC when price dips
              </p>
            </div>
          </div>

          {/* APY — prominent, not buried */}
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Base APY</div>
            <div className="text-2xl font-mono font-bold text-success">+{TYDRO_APY}%</div>
            <div className="text-[10px] text-muted-foreground">earning while you wait</div>
          </div>
        </div>

        {/* ── Price distance gauge ──────────────────────────────────────────── */}
        <div className="rounded-md bg-background border border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Distance from buy trigger</span>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-muted-foreground">
                Trigger <span className="text-foreground font-semibold">{formatUsd(TRIGGER_PRICE)}</span>
              </span>
              <span className="text-muted-foreground">
                Current <span className="text-success font-semibold">{formatUsd(STRC_PRICE_USD)}</span>
              </span>
            </div>
          </div>
          <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000"
              style={{
                width: `${gaugeFill}%`,
                background: `linear-gradient(to right, #dc2626, #d97706 40%, #16a34a)`,
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px]">
            <span className="text-muted-foreground">Buys here ↓</span>
            <span className={cn('font-mono', distancePct < 5 ? 'text-destructive' : distancePct < 10 ? 'text-yellow-500' : 'text-success')}>
              {distancePct.toFixed(1)}% above trigger
            </span>
          </div>
        </div>
      </div>

      {/* ── Main two-column body ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">

        {/* ── Left: Balance + Deposit/Withdraw ────────────────────────────── */}
        <div className="p-6 space-y-5">

          {/* Balance stats */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Vault Balance</div>
              <div className="text-2xl font-mono font-semibold">{formatUsd(VAULT_BALANCE)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                {formatUsd(yieldPerDay)}/day
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Yield Earned</div>
              {/* Animated ticker */}
              <div className={cn(
                'text-2xl font-mono font-semibold tabular-nums transition-colors',
                strategyOn ? 'text-success' : 'text-muted-foreground',
              )}>
                +{formatYield(yieldEarned)}
              </div>
              <div className="text-[10px] mt-0.5 flex items-center gap-1">
                {strategyOn ? (
                  <>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                    <span className="text-success/70">accruing live</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">paused</span>
                )}
              </div>
            </div>
          </div>

          {/* Deposit / Withdraw */}
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

          <div className="space-y-3">
            <div>
              <div className="flex justify-between mb-1.5 text-[10px] text-muted-foreground">
                <span>Amount</span>
                {activeTab === 'deposit' ? (
                  <span>
                    Available:{' '}
                    <span className="font-mono text-foreground">{formatUsd(WALLET_USDC)}</span>
                    <button
                      className="ml-1.5 text-primary hover:underline"
                      onClick={() => setDepositAmount(String(WALLET_USDC))}
                    >
                      MAX
                    </button>
                  </span>
                ) : (
                  <span>
                    In vault:{' '}
                    <span className="font-mono text-foreground">{formatUsd(VAULT_BALANCE)}</span>
                    <button
                      className="ml-1.5 text-primary hover:underline"
                      onClick={() => setWithdrawAmount(String(VAULT_BALANCE))}
                    >
                      MAX
                    </button>
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={activeTab === 'deposit' ? depositAmount : withdrawAmount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, '');
                    activeTab === 'deposit' ? setDepositAmount(val) : setWithdrawAmount(val);
                  }}
                  placeholder="0.00"
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 font-mono text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  USDC
                </span>
              </div>
            </div>
            <button
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

          {/* Next trigger preview — recalculates with deposit input */}
          <div className="rounded-md bg-background border border-border p-3 space-y-1.5">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
              Next trigger preview
              {depositAmount && parseFloat(depositAmount) > 0 && (
                <span className="ml-1.5 text-primary normal-case">(with your deposit)</span>
              )}
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Deploys</span>
              <span className="font-mono">{formatUsd(deployAmount)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Buys ~</span>
              <span className="font-mono">{strcPerTrigger.toFixed(2)} STRC at {formatUsd(TRIGGER_PRICE)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Vault runway</span>
              <span className="font-mono">{formatRunway(deployPct)}</span>
            </div>
          </div>
        </div>

        {/* ── Right: Strategy Configuration ──────────────────────────────── */}
        <div className="p-6 space-y-5">

          {/* Strategy header + toggle */}
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold">Buy-the-Dip Strategy</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Auto-buys STRC when price drops below {formatUsd(TRIGGER_PRICE)}
              </p>
            </div>

            {/* Toggle with tooltip */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setStrategyOn(!strategyOn)}
                onMouseEnter={() => setShowToggleTip(true)}
                onMouseLeave={() => setShowToggleTip(false)}
                aria-label={strategyOn ? 'Pause strategy' : 'Resume strategy'}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors focus:outline-none',
                  strategyOn ? 'bg-success' : 'bg-muted',
                )}
              >
                <span className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  strategyOn ? 'translate-x-[18px]' : 'translate-x-0.5',
                )} />
              </button>
              {showToggleTip && (
                <div className="absolute right-0 top-7 z-20 w-52 rounded-md bg-foreground px-3 py-2 text-[10px] text-background shadow-xl text-center leading-relaxed">
                  {strategyOn
                    ? 'Pause buying — USDC stays in Tydro earning yield, no auto-buys'
                    : 'Resume — re-enables automatic STRC purchases on price dips'}
                </div>
              )}
            </div>
          </div>

          {/* Trigger card */}
          <div className="rounded-md border border-border bg-background p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Buy trigger</span>
              <span className="text-sm font-mono font-semibold">STRC &lt; {formatUsd(TRIGGER_PRICE)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Current price</span>
              <span className="text-xs font-mono text-success">{formatUsd(STRC_PRICE_USD)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Gap to trigger</span>
              <span className="text-xs font-mono text-muted-foreground">
                {formatUsd(STRC_PRICE_USD - TRIGGER_PRICE)} · {distancePct.toFixed(1)}% away
              </span>
            </div>
          </div>

          {/* Deploy % slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Deploy per trigger</label>
              <span className="text-sm font-mono font-semibold text-primary">{deployPct}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="100"
              step="5"
              value={deployPct}
              onChange={(e) => setDeployPct(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between">
              {[10, 25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setDeployPct(pct)}
                  className={cn(
                    'text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors',
                    deployPct === pct ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {pct}%
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {deployPct >= 100
                ? 'All-in — entire vault deploys on first trigger. Maximum conviction.'
                : `Spreads across ${runway} dip${runway !== 1 ? 's' : ''} — vault stays active longer, averages down over time.`}
            </p>
          </div>

          {/* Activity log */}
          <div className="space-y-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Recent Activity
            </div>
            <div className="rounded-md border border-border bg-background divide-y divide-border">
              <div className="px-3 py-4 text-center">
                <p className="text-[11px] text-muted-foreground">
                  No buys yet — monitoring for STRC to reach {formatUsd(TRIGGER_PRICE)}
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  Purchases will appear here once the strategy fires
                </p>
              </div>
            </div>
          </div>

          {/* How it works */}
          <div>
            <button
              onClick={() => setShowHowItWorks(!showHowItWorks)}
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={cn('transition-transform', showHowItWorks ? 'rotate-180' : '')}
              >
                <path d="m6 9 6 6 6-6"/>
              </svg>
              How does this work?
            </button>
            {showHowItWorks && (
              <div className="mt-2 rounded-md bg-background border border-border p-3 space-y-2 text-[10px] text-muted-foreground leading-relaxed">
                <p>1. Deposit USDC into the vault — it goes straight into Tydro, earning <strong className="text-foreground">{TYDRO_APY}% APY</strong> while idle.</p>
                <p>2. A keeper monitors the STRC/USD price via Pyth. When STRC drops below <strong className="text-foreground">{formatUsd(TRIGGER_PRICE)}</strong>, it pulls {deployPct}% from the vault and buys STRC on your behalf.</p>
                <p>3. You accumulate STRC at discount prices without watching the market.</p>
              </div>
            )}
          </div>

          {/* Live status */}
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5">
              <span className={cn(
                'h-1.5 w-1.5 rounded-full',
                strategyOn ? 'bg-success animate-pulse' : 'bg-muted-foreground',
              )} />
              <span className="text-muted-foreground">
                {strategyOn ? 'Monitoring STRC/USD via Pyth' : 'Strategy paused'}
              </span>
            </div>
            <span className="text-muted-foreground font-mono">live</span>
          </div>
        </div>
      </div>
    </div>
  );
}
