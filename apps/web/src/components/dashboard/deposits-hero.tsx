'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// Mock — replace with real on-chain balance
const MOCK_DEPOSITS_USD = 527_000;
const MOCK_24H_CHANGE = 12_400;
const MOCK_24H_PCT = 2.4;

function useCountUp(target: number, duration = 1800) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return value;
}

export function DepositsHero() {
  const displayValue = useCountUp(MOCK_DEPOSITS_USD);
  const isPositive = MOCK_24H_CHANGE >= 0;

  // Format as $527,000 with animated digits
  const formatted = displayValue.toLocaleString('en-US');

  return (
    <div className="flex items-end justify-between py-2">
      <div>
        <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-2">
          Your Deposits
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-mono font-bold tracking-tight text-foreground">
            ${formatted}
          </span>
          <span className="text-sm font-mono text-muted-foreground">.00</span>
        </div>
      </div>

      <div className={cn(
        'text-right text-sm font-mono font-semibold pb-1',
        isPositive ? 'text-success' : 'text-destructive'
      )}>
        <div>{isPositive ? '+' : ''}${MOCK_24H_CHANGE.toLocaleString('en-US')} today</div>
        <div className="text-xs font-normal text-muted-foreground mt-0.5">
          {isPositive ? '+' : ''}{MOCK_24H_PCT}% 24h
        </div>
      </div>
    </div>
  );
}
