'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ── Spreads Logo ────────────────────────────────────────────────────────────────

function SpreadsLogo({ size = 18, color = '#1a3520' }: { size?: number; color?: string }) {
  const h = (size / 18) * 22;
  return (
    <svg width={size} height={h} viewBox="415 379 250 322" xmlns="http://www.w3.org/2000/svg">
      <polygon fill={color} points="416.8 476.1 525.8 476.4 602 379.7 663.9 380.4 664.2 380.7 662.9 484.1 537.5 484 473 581.2 415.8 580.8 416.8 476.1" />
      <polygon fill={color} points="416.8 605.1 525.8 605.4 591.9 508.8 664.2 508.8 662.9 610.4 537.5 613 483 700.3 415.8 699.9 416.8 605.1" />
    </svg>
  );
}

// ── Animated Counter ────────────────────────────────────────────────────────────

function AnimatedCounter({ target, suffix = '', prefix = '', duration = 1800, decimals = 0, active = false }: {
  target: number; suffix?: string; prefix?: string; duration?: number; decimals?: number; active?: boolean;
}) {
  const [display, setDisplay] = useState(0);
  const animated = useRef(false);

  useEffect(() => {
    if (active && !animated.current) {
      animated.current = true;
      const start = performance.now();
      function tick(now: number) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(eased * target);
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
  }, [active, target, duration]);

  return (
    <span className="font-mono font-bold tabular-nums">
      {prefix}{decimals > 0 ? display.toFixed(decimals) : Math.floor(display)}{suffix}
    </span>
  );
}

// ── Flow Diagram Step ───────────────────────────────────────────────────────────

function FlowStep({ n, title, desc, active = false, last = false }: {
  n: string; title: string; desc: string; active?: boolean; last?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-500"
          style={{
            borderColor: active ? '#16a34a' : '#e5e7eb',
            backgroundColor: active ? 'rgba(22,163,74,0.1)' : 'transparent',
          }}
        >
          <span className="text-[10px] font-mono font-bold" style={{ color: active ? '#16a34a' : '#6b6866' }}>
            {active ? '\u2713' : n}
          </span>
        </div>
        {!last && (
          <div
            className="w-px flex-1 my-1.5 transition-all duration-500"
            style={{ minHeight: 20, backgroundColor: active ? '#16a34a' : '#e5e7eb' }}
          />
        )}
      </div>
      <div className="pb-5">
        <p className="text-sm font-semibold" style={{ color: '#0a0a0a' }}>{title}</p>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#6b6866' }}>{desc}</p>
      </div>
    </div>
  );
}

// ── Animated Flow ───────────────────────────────────────────────────────────────

function AnimatedFlow({ steps, label, active }: { steps: { n: string; title: string; desc: string }[]; label: string; active: boolean }) {
  const [activeStep, setActiveStep] = useState(-1);
  const started = useRef(false);

  useEffect(() => {
    if (active && !started.current) {
      started.current = true;
      steps.forEach((_, i) => {
        setTimeout(() => setActiveStep(i), (i + 1) * 600);
      });
    }
  }, [active, steps]);

  return (
    <div className="rounded-lg border bg-white p-6" style={{ borderColor: '#e5e7eb' }}>
      <p className="text-[10px] font-medium tracking-widest uppercase mb-5" style={{ color: '#6b6866' }}>
        {label}
      </p>
      <div className="space-y-0">
        {steps.map((step, i) => (
          <FlowStep key={step.n} {...step} active={i <= activeStep} last={i === steps.length - 1} />
        ))}
      </div>
    </div>
  );
}

// ── Stat Card ───────────────────────────────────────────────────────────────────

function StatCard({ label, children, accent }: { label: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-lg border bg-white p-5" style={{ borderColor: '#e5e7eb' }}>
      <div className="text-[10px] font-medium tracking-widest uppercase mb-2" style={{ color: '#6b6866' }}>{label}</div>
      <div className="text-3xl font-mono font-bold" style={{ color: accent ?? '#0a0a0a' }}>{children}</div>
    </div>
  );
}

// ── Architecture Block ──────────────────────────────────────────────────────────

function ArchBlock({ label, items, accent }: { label: string; items: string[]; accent: string }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: accent + '40', backgroundColor: accent + '08' }}>
      <div className="text-[10px] font-mono font-bold tracking-widest uppercase mb-3" style={{ color: accent }}>{label}</div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item} className="flex items-center gap-2 text-xs" style={{ color: '#0a0a0a' }}>
            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: accent }} />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Demo: Loop Form → Loop Progress ─────────────────────────────────────────────

function DemoLoop({ active, onReset }: { active: boolean; onReset?: () => void }) {
  const [phase, setPhase] = useState<'form' | 'progress' | 'done'>('form');
  const [typedAmount, setTypedAmount] = useState('');
  const [selectedLev, setSelectedLev] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [iteration, setIteration] = useState(0);
  const [stepLabel, setStepLabel] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;

    // Phase 1: Type amount
    const amount = '500.00';
    let i = 0;
    const typeInterval = setInterval(() => {
      i++;
      setTypedAmount(amount.slice(0, i));
      if (i >= amount.length) clearInterval(typeInterval);
    }, 120);

    // Phase 2: Select leverage
    setTimeout(() => setSelectedLev(3), 1200);

    // Phase 3: "Submit" → transition to progress
    setTimeout(() => {
      setPhase('progress');
      setProgressPct(8);
    }, 2200);

    // Phase 4: Animate iterations
    const steps = ['Wrapping STRCx...', 'Supplying to Morpho...', 'Borrowing USDC...', 'Swapping via CoW...'];
    [0, 1, 2].forEach((iter) => {
      steps.forEach((step, si) => {
        setTimeout(() => {
          setIteration(iter);
          setStepLabel(step);
          setProgressPct(Math.min(((iter * 4 + si + 1) / 12) * 100, 95));
        }, 3000 + iter * 2400 + si * 600);
      });
    });

    // Phase 5: Complete
    setTimeout(() => {
      setPhase('done');
      setProgressPct(100);
      setIteration(3);
      setStepLabel('');
    }, 10200);
  }, [active]);

  if (phase === 'form') {
    return (
      <div className="rounded-lg border bg-white p-5 space-y-4" style={{ borderColor: '#e5e7eb' }}>
        <div className="flex items-center gap-1 rounded-md border p-0.5" style={{ borderColor: '#e5e7eb', backgroundColor: '#f0eeea' }}>
          <div className="rounded px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase bg-white shadow-sm" style={{ color: '#0a0a0a' }}>Start Loop</div>
          <div className="rounded px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase" style={{ color: '#6b6866' }}>Unwind</div>
        </div>

        <div className="flex items-center justify-between rounded-md px-3 py-2" style={{ backgroundColor: '#f0eeea' }}>
          <span className="text-[10px] font-mono tracking-widest uppercase" style={{ color: '#6b6866' }}>USDC Balance</span>
          <span className="text-xs font-mono font-semibold">$1,250.00</span>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-medium tracking-widest uppercase" style={{ color: '#6b6866' }}>Deposit Amount</label>
          <div className="relative">
            <div className="w-full rounded-md border px-3 py-3 font-mono text-lg" style={{ borderColor: typedAmount ? '#0a0a0a' : '#e5e7eb', backgroundColor: '#f0eeea', color: '#0a0a0a', minHeight: 48 }}>
              {typedAmount || <span style={{ color: '#6b6866' }}>0.00</span>}
              {typedAmount.length < 6 && <span className="inline-block w-0.5 h-5 ml-0.5 align-middle" style={{ backgroundColor: '#0a0a0a', animation: 'pitch-cursor 1s step-end infinite' }} />}
            </div>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#6b6866' }}>USDC</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs" style={{ color: '#6b6866' }}>Target Leverage</label>
          <div className="grid grid-cols-3 gap-2">
            {[2, 3, 3.5].map((lev) => (
              <div key={lev} className="rounded-md border py-2.5 text-center font-mono text-sm font-semibold transition-all duration-300"
                style={{
                  backgroundColor: selectedLev === lev ? '#0a0a0a' : 'white',
                  color: selectedLev === lev ? 'white' : '#6b6866',
                  borderColor: selectedLev === lev ? '#0a0a0a' : '#e5e7eb',
                }}>
                {lev}x
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md py-3 text-center text-xs font-medium tracking-widest uppercase transition-opacity" style={{
          backgroundColor: typedAmount && selectedLev ? '#2d2d2d' : '#e5e7eb',
          color: typedAmount && selectedLev ? 'white' : '#6b6866',
        }}>
          {typedAmount && selectedLev ? `Deposit & Loop ${selectedLev}x` : 'Deposit & Loop'}
        </div>

        {typedAmount && selectedLev > 0 && (
          <div className="rounded-md border p-3 space-y-1.5" style={{ borderColor: '#e5e7eb', backgroundColor: '#f0eeea' }}>
            <div className="flex justify-between text-xs"><span style={{ color: '#6b6866' }}>STRCx purchased</span><span className="font-mono">~5.00 STRCx</span></div>
            <div className="flex justify-between text-xs"><span style={{ color: '#6b6866' }}>Total exposure</span><span className="font-mono">$1,500.00</span></div>
            <div className="flex justify-between text-xs"><span style={{ color: '#6b6866' }}>Est. debt</span><span className="font-mono">$1,000.00 USDC</span></div>
            <div className="flex justify-between text-xs border-t pt-1.5" style={{ borderColor: '#e5e7eb' }}>
              <span style={{ color: '#6b6866' }}>Net APY</span>
              <span className="font-mono font-semibold" style={{ color: '#16a34a' }}>+30.3%</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Progress / Done phase
  return (
    <div className="rounded-lg border bg-white overflow-hidden space-y-4" style={{ borderColor: '#e5e7eb' }}>
      <div className="h-0.5 w-full" style={{ backgroundColor: '#f0eeea' }}>
        <div className="h-full transition-all duration-700 ease-out" style={{ width: `${progressPct}%`, backgroundColor: phase === 'done' ? '#16a34a' : '#2d2d2d' }} />
      </div>
      <div className="px-5 pb-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: '#6b6866' }}>Loop Progress</span>
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded border" style={{
            borderColor: phase === 'done' ? 'rgba(22,163,74,0.5)' : 'rgba(45,45,45,0.5)',
            color: phase === 'done' ? '#16a34a' : '#2d2d2d',
          }}>
            {phase === 'done' ? 'COMPLETED' : 'IN PROGRESS'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs">
          <div><span style={{ color: '#6b6866' }}>Leverage</span><div className="font-mono font-semibold mt-0.5" style={{ color: '#2d2d2d' }}>3.0x</div></div>
          <div><span style={{ color: '#6b6866' }}>Iterations</span><div className="font-mono font-semibold mt-0.5">{Math.min(iteration + 1, 3)}/3</div></div>
          <div><span style={{ color: '#6b6866' }}>Health Factor</span><div className="font-mono font-semibold mt-0.5" style={{ color: '#16a34a' }}>{phase === 'done' ? '1.82' : '2.41'}</div></div>
        </div>

        <div className="space-y-2">
          {[1, 2, 3].map((n) => {
            const completed = n <= iteration + (phase === 'done' ? 1 : 0);
            const isActive = !completed && n === iteration + 1 && phase !== 'done';
            return (
              <div key={n} className="flex items-center gap-3 text-xs">
                <div className="h-6 w-6 rounded-full border flex items-center justify-center text-[10px] font-mono font-bold shrink-0" style={{
                  borderColor: completed ? '#16a34a' : isActive ? '#2d2d2d' : '#e5e7eb',
                  backgroundColor: completed ? 'rgba(22,163,74,0.1)' : isActive ? 'rgba(45,45,45,0.1)' : 'transparent',
                  color: completed ? '#16a34a' : isActive ? '#2d2d2d' : '#6b6866',
                  ...(isActive ? { animation: 'pulse 2s ease-in-out infinite' } : {}),
                }}>
                  {completed ? '\u2713' : n}
                </div>
                <div className="flex-1">
                  <div style={{ color: '#0a0a0a' }}>Iteration {n}</div>
                  {isActive && stepLabel && <div style={{ color: '#6b6866' }}>{stepLabel}</div>}
                  {completed && <div style={{ color: '#6b6866' }}>Done</div>}
                </div>
              </div>
            );
          })}
        </div>

        {phase === 'done' && (
          <button onClick={onReset} className="w-full rounded-md py-2.5 text-center text-sm font-medium transition-colors hover:opacity-80" style={{ backgroundColor: '#f0eeea', color: '#0a0a0a' }}>
            Start New Loop
          </button>
        )}
      </div>
    </div>
  );
}

// ── Demo: Position Card ─────────────────────────────────────────────────────────

function DemoPosition({ active }: { active: boolean }) {
  const [hfDisplay, setHfDisplay] = useState(1);
  const [hfPct, setHfPct] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    // Delay to let loop complete first
    setTimeout(() => {
      const target = 1.82;
      const targetPct = Math.min(Math.max((target - 1) / 2, 0), 1) * 100;
      const start = performance.now();
      function tick(now: number) {
        const progress = Math.min((now - start) / 900, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setHfDisplay(1 + eased * (target - 1));
        setHfPct(eased * targetPct);
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, 8500);
  }, [active]);

  return (
    <div className="rounded-lg border bg-white p-5 space-y-4" style={{ borderColor: '#e5e7eb' }}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium" style={{ color: '#6b6866' }}>Position</span>
        <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border" style={{ borderColor: 'rgba(22,163,74,0.3)', backgroundColor: 'rgba(22,163,74,0.1)', color: '#16a34a' }}>ACTIVE</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border p-3" style={{ borderColor: '#e5e7eb', backgroundColor: '#f0eeea' }}>
          <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: '#6b6866' }}>Equity</div>
          <div className="text-xl font-mono font-bold" style={{ color: '#0a0a0a' }}>$500.00</div>
          <div className="text-[10px] font-mono mt-0.5" style={{ color: '#6b6866' }}>5.00 STRCx</div>
        </div>
        <div className="rounded-md border p-3" style={{ borderColor: '#e5e7eb', backgroundColor: '#f0eeea' }}>
          <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: '#6b6866' }}>Current APY</div>
          <div className="text-xl font-mono font-bold" style={{ color: '#16a34a' }}>+30.3%</div>
          <div className="text-[10px] font-mono mt-0.5" style={{ color: '#6b6866' }}>at 3.0x leverage</div>
        </div>
        <div className="rounded-md border p-3" style={{ borderColor: '#e5e7eb', backgroundColor: '#f0eeea' }}>
          <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: '#6b6866' }}>Loan</div>
          <div className="text-xl font-mono font-bold" style={{ color: '#d93030', opacity: 0.8 }}>$1,000.00</div>
          <div className="text-[10px] font-mono mt-0.5" style={{ color: '#6b6866' }}>USDC borrowed</div>
        </div>
        <div className="rounded-md border p-3" style={{ borderColor: '#e5e7eb', backgroundColor: '#f0eeea' }}>
          <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: '#6b6866' }}>Collateral</div>
          <div className="text-xl font-mono font-bold" style={{ color: '#0a0a0a' }}>$1,500.00</div>
          <div className="text-[10px] font-mono mt-0.5" style={{ color: '#6b6866' }}>15.00 STRCx</div>
        </div>
      </div>

      {/* Health Factor Gauge */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: '#6b6866' }}>Health Factor</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider" style={{ color: '#16a34a' }}>SAFE</span>
            <span className="text-lg font-mono font-bold" style={{ color: '#16a34a' }}>{hfDisplay.toFixed(2)}</span>
          </div>
        </div>
        <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#f0eeea' }}>
          <div className="absolute left-0 top-0 h-full rounded-full shadow-md" style={{ width: `${hfPct}%`, backgroundColor: '#16a34a', boxShadow: '0 0 8px rgba(22,163,74,0.3)', transition: 'none' }} />
          <div className="absolute top-0 h-full w-px" style={{ left: '25%', backgroundColor: 'rgba(202,138,4,0.5)' }} />
          <div className="absolute top-0 h-full w-px" style={{ left: '50%', backgroundColor: 'rgba(22,163,74,0.5)' }} />
        </div>
        <div className="flex justify-between text-[9px] font-mono" style={{ color: '#6b6866' }}>
          <span>1.0 LIQ</span><span>1.5</span><span>2.0</span><span>3.0+</span>
        </div>
      </div>

      {/* Bottom stats */}
      <div className="grid grid-cols-2 gap-4 pt-2 border-t" style={{ borderColor: '#e5e7eb' }}>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: '#6b6866' }}>Leverage</span>
          <span className="text-sm font-mono font-semibold" style={{ color: '#2d2d2d' }}>3.0x</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: '#6b6866' }}>Liq. Price</span>
          <span className="text-sm font-mono font-semibold">$54.95</span>
        </div>
      </div>

      {/* Yield section */}
      <div className="rounded-md border p-3 space-y-2" style={{ borderColor: '#e5e7eb' }}>
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: '#6b6866' }}>STRCx Yield (3.0x leveraged)</span>
          <span className="font-mono" style={{ color: '#16a34a' }}>+34.5%</span>
        </div>
        <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: '#e5e7eb' }}>
          <span className="text-xs font-medium" style={{ color: '#0a0a0a' }}>Effective Net Yield</span>
          <span className="text-sm font-mono font-bold" style={{ color: '#16a34a' }}>+30.3% APY</span>
        </div>
      </div>
    </div>
  );
}

// ── Demo: Unwind Progress ───────────────────────────────────────────────────────

function DemoUnwind({ active, onReset }: { active: boolean; onReset?: () => void }) {
  const [step, setStep] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [done, setDone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;

    // Start after loop + position are shown
    const steps = [
      { delay: 10500, step: 1, pct: 20, label: 'Repaying USDC...' },
      { delay: 11500, step: 2, pct: 45, label: 'Withdrawing collateral...' },
      { delay: 12500, step: 3, pct: 70, label: 'Swapping STRCx → USDC...' },
      { delay: 13500, step: 4, pct: 90, label: 'Repaying remaining...' },
    ];

    steps.forEach((s) => {
      setTimeout(() => { setStep(s.step); setProgressPct(s.pct); }, s.delay);
    });

    setTimeout(() => { setDone(true); setProgressPct(100); setStep(5); }, 14500);
  }, [active]);

  const UNWIND_STEPS = ['Repaying USDC debt', 'Withdrawing collateral', 'Unwrapping wSTRC → STRCx', 'Swapping STRCx → USDC'];

  return (
    <div className="rounded-lg border bg-white overflow-hidden space-y-4" style={{ borderColor: '#e5e7eb' }}>
      <div className="h-0.5 w-full" style={{ backgroundColor: '#f0eeea' }}>
        <div className="h-full transition-all duration-700 ease-out" style={{ width: `${progressPct}%`, backgroundColor: done ? '#16a34a' : '#c47a1a' }} />
      </div>
      <div className="px-5 pb-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: '#6b6866' }}>Unwind Progress</span>
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded border" style={{
            borderColor: done ? 'rgba(22,163,74,0.5)' : 'rgba(196,122,26,0.5)',
            color: done ? '#16a34a' : '#c47a1a',
          }}>
            {done ? 'COMPLETED' : step === 0 ? 'PENDING' : 'IN PROGRESS'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs">
          <div><span style={{ color: '#6b6866' }}>Target</span><div className="font-mono font-semibold mt-0.5" style={{ color: '#c47a1a' }}>Full</div></div>
          <div><span style={{ color: '#6b6866' }}>Debt Repaid</span><div className="font-mono font-semibold mt-0.5">{done ? '100' : Math.min(step * 25, 95)}%</div></div>
          <div><span style={{ color: '#6b6866' }}>Remaining</span><div className="font-mono font-semibold mt-0.5" style={{ color: done ? '#16a34a' : '#d93030', opacity: done ? 1 : 0.8 }}>{done ? '$0.00' : `$${(1000 - step * 250).toFixed(2)}`}</div></div>
        </div>

        <div className="space-y-2">
          {UNWIND_STEPS.map((label, i) => {
            const stepNum = i + 1;
            const completed = done || step > stepNum;
            const isActive = !done && step === stepNum;
            return (
              <div key={label} className="flex items-center gap-3 text-xs">
                <div className="h-6 w-6 rounded-full border flex items-center justify-center text-[10px] font-mono font-bold shrink-0" style={{
                  borderColor: completed ? '#16a34a' : isActive ? '#c47a1a' : '#e5e7eb',
                  backgroundColor: completed ? 'rgba(22,163,74,0.1)' : isActive ? 'rgba(196,122,26,0.1)' : 'transparent',
                  color: completed ? '#16a34a' : isActive ? '#c47a1a' : '#6b6866',
                  ...(isActive ? { animation: 'pulse 2s ease-in-out infinite' } : {}),
                }}>
                  {completed ? '\u2713' : stepNum}
                </div>
                <span style={{ color: '#0a0a0a' }}>{label}</span>
              </div>
            );
          })}
        </div>

        {done && (
          <button onClick={onReset} className="w-full rounded-md py-2.5 text-center text-sm font-medium hover:opacity-80 transition-colors" style={{ backgroundColor: '#f0eeea', color: '#0a0a0a' }}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}

// ── STRC Price Chart (real API data) ─────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function StrcPriceChart({ active }: { active: boolean }) {
  const [drawn, setDrawn] = useState(0);
  const [prices, setPrices] = useState<Array<{ price: number; timestamp: number }>>([]);

  // Fetch real price data
  useEffect(() => {
    fetch(`${API_URL}/api/grid/price/history?days=180`)
      .then(r => r.json())
      .then(data => { if (data.history?.length) setPrices(data.history); })
      .catch(() => {});
  }, []);

  // Animate draw when active and data is loaded
  useEffect(() => {
    if (!active || prices.length === 0) return;
    const start = performance.now();
    const duration = 2000;
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      setDrawn(progress);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [active, prices.length]);

  if (prices.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-4" style={{ borderColor: '#e5e7eb' }}>
        <div className="h-[160px] flex items-center justify-center">
          <span className="text-xs font-mono" style={{ color: '#d1d5db' }}>Loading chart...</span>
        </div>
      </div>
    );
  }

  const w = 720, h = 200, padX = 44, padY = 14;
  const priceValues = prices.map(p => p.price);
  const rawMin = Math.min(...priceValues);
  const rawMax = Math.max(...priceValues);
  // Round to nearest $5 to get clean Y-axis ticks
  const minP = Math.floor(rawMin / 5) * 5;
  const maxP = Math.ceil(rawMax / 5) * 5;
  // Generate Y-axis ticks every $5
  const yTicks: number[] = [];
  for (let t = minP; t <= maxP; t += 5) yTicks.push(t);
  const chartW = w - padX, chartH = h - padY * 2;

  const points = prices.map((p, i) => ({
    x: padX + (i / (prices.length - 1)) * chartW,
    y: padY + (1 - (p.price - minP) / (maxP - minP)) * chartH,
    price: p.price,
    ts: p.timestamp,
  }));

  const visibleCount = Math.floor(drawn * points.length);
  const visible = points.slice(0, Math.max(visibleCount, 1));
  const last = visible[visible.length - 1];

  const linePath = visible.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = linePath + ` L${last.x.toFixed(1)},${h} L${padX},${h} Z`;

  // $100 peg line
  const pegY = padY + (1 - (100 - minP) / (maxP - minP)) * chartH;

  // Date labels from actual data
  const firstDate = new Date(prices[0].timestamp * 1000);
  const lastDate = new Date(prices[prices.length - 1].timestamp * 1000);
  const midDate = new Date(prices[Math.floor(prices.length / 2)].timestamp * 1000);
  const q1Date = new Date(prices[Math.floor(prices.length / 4)].timestamp * 1000);
  const q3Date = new Date(prices[Math.floor(prices.length * 3 / 4)].timestamp * 1000);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });

  return (
    <div className="rounded-lg border bg-white p-4" style={{ borderColor: '#e5e7eb' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono font-bold tracking-widest uppercase" style={{ color: '#6b6866' }}>STRC / USD</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-semibold" style={{ color: '#e05c00' }}>${last.price.toFixed(2)}</span>
          <span className="text-[10px] font-mono" style={{ color: '#6b6866' }}>6M</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 200 }}>
        {/* Y-axis ticks and grid lines */}
        {yTicks.map((tick) => {
          const y = padY + (1 - (tick - minP) / (maxP - minP)) * chartH;
          const is100 = tick === 100;
          return (
            <g key={tick}>
              <line x1={padX} y1={y} x2={w} y2={y} stroke={is100 ? '#e05c00' : '#e5e7eb'} strokeWidth={is100 ? 1 : 0.5} strokeDasharray={is100 ? '4 3' : 'none'} opacity={is100 ? 0.45 : 0.6} />
              <text x={4} y={y + 3} fill={is100 ? '#e05c00' : '#6b6866'} fontSize="8" fontFamily="IBM Plex Mono" fontWeight={is100 ? '600' : '400'} opacity={is100 ? 0.7 : 0.5}>${tick}</text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#strc-gradient)" opacity="0.12" />

        {/* Price line */}
        <path d={linePath} fill="none" stroke="#e05c00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Current price dot */}
        {visible.length > 1 && <circle cx={last.x} cy={last.y} r="3.5" fill="#e05c00" />}

        <defs>
          <linearGradient id="strc-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e05c00" />
            <stop offset="100%" stopColor="#e05c00" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex items-center justify-between mt-1">
        {[firstDate, q1Date, midDate, q3Date, lastDate].map((d, i) => (
          <span key={i} className="text-[9px] font-mono" style={{ color: '#d1d5db' }}>{fmt(d)}</span>
        ))}
      </div>
    </div>
  );
}

// ── Mini Dip Chart (buy-the-dip visualization, real API data) ────────────────────

function MiniDipChart({ active }: { active: boolean }) {
  const [drawn, setDrawn] = useState(0);
  const [prices, setPrices] = useState<number[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/grid/price/history?days=180`)
      .then(r => r.json())
      .then(data => { if (data.history?.length) setPrices(data.history.map((p: any) => p.price)); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!active || prices.length === 0) return;
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min((now - start) / 1500, 1);
      setDrawn(progress);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [active, prices.length]);

  if (prices.length === 0) return <div style={{ height: 110 }} />;

  const w = 280, h = 110, pad = 4;
  const minP = Math.floor(Math.min(...prices) - 2);
  const maxP = Math.ceil(Math.max(...prices) + 2);

  const points = prices.map((p, i) => ({
    x: pad + (i / (prices.length - 1)) * (w - pad * 2),
    y: pad + (1 - (p - minP) / (maxP - minP)) * (h - pad * 2),
    price: p,
  }));

  const visibleCount = Math.floor(drawn * points.length);
  const visible = points.slice(0, Math.max(visibleCount, 1));
  const linePath = visible.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // $95 threshold line
  const threshY = pad + (1 - (95 - minP) / (maxP - minP)) * (h - pad * 2);

  // Find local minima (dip bottoms) below $95
  const dipBottoms = visible.filter((p, i) => {
    if (p.price >= 95) return false;
    const prev = visible[i - 1];
    const next = visible[i + 1];
    if (!prev || !next) return false;
    return p.price <= prev.price && p.price <= next.price;
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 110 }}>
      {/* $95 threshold */}
      <line x1={pad} y1={threshY} x2={w - pad} y2={threshY} stroke="#d93030" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5" />
      <text x={w - pad} y={threshY - 2} fill="#d93030" fontSize="5" fontFamily="IBM Plex Mono" textAnchor="end" opacity="0.6">$95</text>

      {/* Price line */}
      <path d={linePath} fill="none" stroke="#2d2d2d" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Orange dots on dip bottoms + BUY labels */}
      {dipBottoms.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3.5" fill="#e05c00" />
          <text x={p.x} y={p.y - 5.5} fill="#e05c00" fontSize="4.5" fontFamily="IBM Plex Mono" fontWeight="700" textAnchor="middle">BUY</text>
        </g>
      ))}
    </svg>
  );
}

// ── Buy the Dip Chart (real API data, highlights dip zones) ─────────────────────

function BuyDipChart({ active }: { active: boolean }) {
  const [drawn, setDrawn] = useState(0);
  const [prices, setPrices] = useState<Array<{ price: number; timestamp: number }>>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/grid/price/history?days=180`)
      .then(r => r.json())
      .then(data => { if (data.history?.length) setPrices(data.history); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!active || prices.length === 0) return;
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min((now - start) / 2000, 1);
      setDrawn(progress);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [active, prices.length]);

  if (prices.length === 0) {
    return <div className="h-[120px] flex items-center justify-center"><span className="text-xs font-mono" style={{ color: '#d1d5db' }}>Loading...</span></div>;
  }

  const w = 700, h = 130, padX = 40, padY = 10;
  const priceValues = prices.map(p => p.price);
  const minP = Math.floor(Math.min(...priceValues) / 5) * 5;
  const maxP = Math.ceil(Math.max(...priceValues) / 5) * 5;
  const chartW = w - padX, chartH = h - padY * 2;

  const points = prices.map((p, i) => ({
    x: padX + (i / (prices.length - 1)) * chartW,
    y: padY + (1 - (p.price - minP) / (maxP - minP)) * chartH,
    price: p.price,
  }));

  const visibleCount = Math.floor(drawn * points.length);
  const visible = points.slice(0, Math.max(visibleCount, 1));
  const linePath = visible.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // $95 buy zone threshold
  const threshY = padY + (1 - (95 - minP) / (maxP - minP)) * chartH;
  // $100 peg line
  const pegY = padY + (1 - (100 - minP) / (maxP - minP)) * chartH;

  // Find dip zones (contiguous runs below $95)
  const dipZones: Array<{ startX: number; endX: number; minY: number }> = [];
  let inDip = false;
  let dipStart = 0;
  let dipMinY = 0;
  visible.forEach((p, i) => {
    if (p.price < 95 && !inDip) { inDip = true; dipStart = p.x; dipMinY = p.y; }
    if (inDip && p.price < 95) { dipMinY = Math.max(dipMinY, p.y); }
    if (inDip && (p.price >= 95 || i === visible.length - 1)) {
      dipZones.push({ startX: dipStart, endX: p.x, minY: dipMinY });
      inDip = false;
    }
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono font-bold tracking-widest uppercase" style={{ color: '#6b6866' }}>STRC / USD &mdash; Buy Zone Below $95</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[9px] font-mono" style={{ color: '#16a34a' }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#16a34a' }} /> Buy zone
          </span>
          <span className="flex items-center gap-1.5 text-[9px] font-mono" style={{ color: '#e05c00' }}>
            <div className="w-2 h-0.5" style={{ backgroundColor: '#e05c00' }} /> $100 peg
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 130 }}>
        {/* Y-axis */}
        {[minP, 95, 100, maxP].filter((v, i, a) => a.indexOf(v) === i).map((tick) => {
          const y = padY + (1 - (tick - minP) / (maxP - minP)) * chartH;
          const is95 = tick === 95;
          const is100 = tick === 100;
          return (
            <g key={tick}>
              <line x1={padX} y1={y} x2={w} y2={y} stroke={is100 ? '#e05c00' : is95 ? '#16a34a' : '#e5e7eb'} strokeWidth={is100 || is95 ? 1 : 0.5} strokeDasharray={is100 || is95 ? '4 3' : 'none'} opacity={is100 || is95 ? 0.5 : 0.4} />
              <text x={4} y={y + 3} fill={is100 ? '#e05c00' : is95 ? '#16a34a' : '#6b6866'} fontSize="8" fontFamily="IBM Plex Mono" fontWeight={is100 || is95 ? '600' : '400'} opacity={0.7}>${tick}</text>
            </g>
          );
        })}

        {/* Dip highlight zones */}
        {dipZones.map((zone, i) => (
          <rect key={i} x={zone.startX} y={threshY} width={zone.endX - zone.startX} height={h - padY - threshY} fill="#16a34a" opacity="0.08" rx="2" />
        ))}

        {/* Price line */}
        <path d={linePath} fill="none" stroke="#2d2d2d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Orange dots on dip bottoms */}
        {(() => {
          const bottoms = visible.filter((p, i) => {
            if (p.price >= 95) return false;
            const prev = visible[i - 1];
            const next = visible[i + 1];
            return prev && next && p.price <= prev.price && p.price <= next.price;
          });
          return bottoms.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="4" fill="#16a34a" />
              <text x={p.x} y={p.y - 7} fill="#16a34a" fontSize="7" fontFamily="IBM Plex Mono" fontWeight="700" textAnchor="middle">BUY ${p.price.toFixed(0)}</text>
            </g>
          ));
        })()}
      </svg>
    </div>
  );
}

// ── Section labels ──────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'hero', label: 'Title' },
  { id: 'strc', label: 'STRC' },
  { id: 'solution', label: 'Solution' },
  { id: 'how', label: 'Demo' },
  { id: 'unique', label: 'Unique' },
  { id: 'architecture', label: 'Tech' },
  { id: 'viability', label: 'Viability' },
  { id: 'impact', label: 'Impact' },
];

// ── Main Page ───────────────────────────────────────────────────────────────────

export default function PitchPage() {
  const [page, setPage] = useState(0);
  const [demoKey, setDemoKey] = useState(0);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const transitioning = useRef(false);

  const totalPages = SECTIONS.length;

  const goTo = useCallback((target: number) => {
    if (transitioning.current) return;
    const clamped = Math.max(0, Math.min(totalPages - 1, target));
    if (clamped === page) return;
    transitioning.current = true;
    setPage(clamped);
    setTimeout(() => { transitioning.current = false; }, 600);
  }, [page, totalPages]);

  // Arrow key navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        goTo(page + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goTo(page - 1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, goTo]);

  // Block scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setParallax({
      x: (e.clientX - window.innerWidth / 2) / window.innerWidth,
      y: (e.clientY - window.innerHeight / 2) / window.innerHeight,
    });
  }, []);

  const ease = { transition: 'transform 0.15s ease-out' };
  const blend = { mixBlendMode: 'multiply' as const };
  const isActive = (i: number) => page === i;

  return (
    <div
      onMouseMove={handleMouseMove}
      className="fixed inset-0 overflow-hidden"
      style={{
        background: '#f5f4f0',
        backgroundImage: 'linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)',
        backgroundSize: '52px 52px',
        fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      }}
    >
      {/* ── Navigation dots (right) ── */}
      <nav className="fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col items-end gap-3">
        {SECTIONS.map(({ label }, i) => (
          <button key={i} onClick={() => goTo(i)} className="group flex items-center gap-2">
            <span className="text-[9px] font-mono tracking-widest uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ color: '#6b6866' }}>
              {label}
            </span>
            <div
              className="rounded-full transition-all duration-300"
              style={{
                width: page === i ? 10 : 6,
                height: page === i ? 10 : 6,
                backgroundColor: page === i ? '#1a3520' : '#d1d5db',
              }}
            />
          </button>
        ))}
      </nav>

      {/* ── Page counter (bottom left) ── */}
      <div className="fixed bottom-5 left-6 z-50 flex items-center gap-3">
        <span className="text-[10px] font-mono" style={{ color: '#6b6866' }}>
          {String(page + 1).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => goTo(page - 1)}
            disabled={page === 0}
            className="w-6 h-6 rounded border flex items-center justify-center transition-colors disabled:opacity-20"
            style={{ borderColor: '#e5e7eb', color: '#6b6866' }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M6 2 L3 5 L6 8" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
          <button
            onClick={() => goTo(page + 1)}
            disabled={page === totalPages - 1}
            className="w-6 h-6 rounded border flex items-center justify-center transition-colors disabled:opacity-20"
            style={{ borderColor: '#e5e7eb', color: '#6b6866' }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M4 2 L7 5 L4 8" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
        </div>
      </div>

      {/* ── Keyboard hint (bottom right) ── */}
      <div className="fixed bottom-5 right-6 z-50">
        <span className="text-[9px] font-mono" style={{ color: '#d1d5db' }}>
          Arrow keys to navigate
        </span>
      </div>

      {/* ── Slides container ── */}
      <div
        className="absolute inset-0 transition-transform duration-500 ease-out"
        style={{ transform: `translateY(-${page * 100}vh)` }}
      >
        {/* ═══ SLIDE 0: HERO ═══ */}
        <section className="h-screen w-screen flex items-center justify-center relative overflow-hidden px-6">
          {/* Saylor B&W — left edge, full height cover */}
          <img src="/saylor-bw.png" alt="" aria-hidden className="absolute bottom-0 select-none pointer-events-none"
            style={{
              left: 0, bottom: 'calc(-8vh - 104px)', width: '30vw', height: '100vh',
              objectFit: 'cover', objectPosition: 'center top',
              zIndex: 6,
              transform: `translate(${parallax.x * 8}px, ${parallax.y * 4}px)`,
              ...ease,
            }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />

          {/* Bitcoin hand — behind B&W Saylor */}
          <img src="/bitcoin-hand.png" alt="" aria-hidden className="absolute select-none pointer-events-none"
            style={{
              left: '4vw', bottom: 'calc(15% - 156px)', height: '52vh',
              zIndex: 5, ...blend,
              transform: `translate(${parallax.x * -18}px, ${parallax.y * 10}px)`,
              ...ease,
            }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />

          {/* $100 bill — behind colour Saylor */}
          <img src="/hundred-dollar.png" alt="" aria-hidden className="absolute select-none pointer-events-none"
            style={{
              right: '14vw', top: 'calc(30% + 143px)', width: '28.6vw', maxWidth: '442px',
              zIndex: 3, ...blend,
              transform: `translate(${parallax.x * 20}px, ${parallax.y * -12}px) rotate(-4deg)`,
              ...ease,
              filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.10))',
            }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />

          {/* Saylor colour — right edge, full height cover */}
          <img src="/saylor-colour.png" alt="" aria-hidden className="absolute select-none pointer-events-none"
            style={{
              right: 0, bottom: -104, width: '30vw', height: '100vh',
              objectFit: 'cover', objectPosition: 'center top',
              zIndex: 14,
              transform: `translate(${parallax.x * 10}px, ${parallax.y * 5}px)`,
              ...ease,
            }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />

          <div className="relative flex flex-col items-center text-center max-w-[640px]" style={{ zIndex: 20 }}>
            <div className="flex items-center gap-2.5 mb-8">
              <SpreadsLogo size={24} />
              <span className="text-base font-semibold tracking-widest uppercase" style={{ color: '#0a0a0a' }}>Spreads</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.05] mb-5" style={{ color: '#0a0a0a' }}>
              <span style={{ color: '#e05c00' }}>Stretch</span> Your<br />STRC Yield
            </h1>
            <p className="text-base mb-3 leading-relaxed max-w-md" style={{ color: '#6b6866' }}>
              Leverage. Trade. Save.
            </p>
            <p className="text-sm font-mono font-semibold mb-10" style={{ color: '#16a34a' }}>
              Up to 46% APY on STRC &mdash; one click.
            </p>
          </div>
        </section>

        {/* ═══ SLIDE 1: WHAT IS STRC ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6 relative overflow-hidden">
          <img src="/saylor-colour.png" alt="" aria-hidden className="absolute bottom-0 select-none pointer-events-none"
            style={{
              right: 0, bottom: -104, width: '30vw', height: '100vh',
              objectFit: 'cover', objectPosition: 'center top',
              zIndex: 1, opacity: 1,
              mixBlendMode: 'multiply',
            }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div className="relative max-w-3xl w-full" style={{ zIndex: 10, opacity: isActive(1) ? 1 : 0, transform: isActive(1) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight" style={{ color: '#0a0a0a' }}>
              What is <span style={{ color: '#e05c00' }}>STRC</span>?
            </h2>

            <div className="mb-8">
              <StrcPriceChart active={isActive(1)} />
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="rounded-lg border bg-white p-5" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-3xl font-mono font-bold mb-1" style={{ color: '#e05c00' }}>$40B</div>
                <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6b6866' }}>Market Cap</div>
              </div>
              <div className="rounded-lg border bg-white p-5" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-3xl font-mono font-bold mb-1" style={{ color: '#16a34a' }}>11.5%</div>
                <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6b6866' }}>Dividend Yield</div>
              </div>
              <div className="rounded-lg border bg-white p-5" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-3xl font-mono font-bold mb-1" style={{ color: '#2d2d2d' }}>$100</div>
                <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6b6866' }}>Soft Peg</div>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-mono font-semibold tracking-widest uppercase" style={{ color: '#d93030' }}>The Problem</span>
              <p className="text-lg font-medium mt-2 leading-relaxed" style={{ color: '#0a0a0a' }}>
                An incredibly unique instrument with<br /><span style={{ color: '#d93030' }}>NO</span> on-chain products built for it.
              </p>
            </div>

          </div>
        </section>

        {/* ═══ SLIDE 2: SOLUTION ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-4xl w-full" style={{ opacity: isActive(2) ? 1 : 0, transform: isActive(2) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <h2 className="text-4xl md:text-5xl font-bold mb-4 leading-tight" style={{ color: '#0a0a0a' }}>
              An <span style={{ color: '#16a34a' }}>ecosystem</span> of products<br />enriching what you can do with STRC.
            </h2>
            <div className="grid grid-cols-3 gap-5 mt-8">
              {/* Leverage */}
              <div className="rounded-lg border bg-white px-8 pt-8 pb-10 flex flex-col items-center" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-lg font-mono font-bold tracking-widest uppercase mb-auto" style={{ color: '#e05c00' }}>Leverage</div>
                <div className="text-7xl font-mono font-bold my-auto" style={{ color: '#16a34a' }}>
                  <AnimatedCounter target={46} suffix="%" active={isActive(2)} />
                </div>
                <div className="text-sm font-mono font-semibold mt-auto tracking-widest uppercase" style={{ color: '#6b6866' }}>APY</div>
              </div>
              {/* Trading */}
              <div className="rounded-lg border bg-white px-4 pt-8 pb-4 flex flex-col items-center" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-lg font-mono font-bold tracking-widest uppercase mb-4" style={{ color: '#2d2d2d' }}>Trading</div>
                <div className="flex-1 w-full flex items-center">
                  <MiniDipChart active={isActive(2)} />
                </div>
              </div>
              {/* Savings */}
              <div className="rounded-lg border bg-white px-8 pt-8 pb-10 flex flex-col items-center" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-lg font-mono font-bold tracking-widest uppercase mb-auto" style={{ color: '#16a34a' }}>Savings</div>
                <div className="my-auto pt-4" />
                <div className="flex items-center justify-center gap-3">
                  {/* Netflix */}
                  <div className="w-[72px] h-24 rounded-lg border flex flex-col items-center justify-center shadow-sm" style={{ borderColor: '#e5e7eb', background: 'linear-gradient(135deg, #e50914 0%, #b20710 100%)' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M5.398 0v.006c3.028 8.556 5.37 15.175 8.348 23.596 2.344.058 4.85.398 4.854.398-2.8-7.924-5.923-16.747-8.487-24h-4.715zm8.489 0v9.63L18.6 22.951c-.043-7.86-.004-15.913.002-22.95zM5.398 1.05V24c1.873-.225 2.81-.312 4.715-.398v-9.22z"/></svg>
                    <span className="text-[7px] font-mono font-bold text-white mt-1.5">$15.99</span>
                  </div>
                  {/* Spotify */}
                  <div className="w-[72px] h-24 rounded-lg border flex flex-col items-center justify-center shadow-sm" style={{ borderColor: '#e5e7eb', background: 'linear-gradient(135deg, #1DB954 0%, #158a3d 100%)' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                    <span className="text-[7px] font-mono font-bold text-white mt-1.5">$11.99</span>
                  </div>
                  {/* ChatGPT */}
                  <div className="w-[72px] h-24 rounded-lg border flex flex-col items-center justify-center shadow-sm" style={{ borderColor: '#e5e7eb', background: 'linear-gradient(135deg, #10a37f 0%, #0d8c6d 100%)' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>
                    <span className="text-[7px] font-mono font-bold text-white mt-1.5">$20.00</span>
                  </div>
                </div>
                <div className="text-[9px] font-mono font-semibold mt-4 tracking-widest uppercase" style={{ color: '#6b6866' }}>Paid from yield</div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SLIDE 3: HOW IT WORKS — LIVE DEMO ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-6xl w-full" style={{ opacity: isActive(3) ? 1 : 0, transform: isActive(3) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <h2 className="text-3xl md:text-4xl font-bold mb-6 leading-tight" style={{ color: '#0a0a0a' }}>
              The Highest RWA Yield <span style={{ color: '#e05c00' }}>In DeFi</span> today.
            </h2>
            <div key={demoKey} className="grid md:grid-cols-3 gap-4">
              <div className="flex flex-col">
                <p className="text-[10px] font-mono font-semibold tracking-widest uppercase mb-3" style={{ color: '#6b6866' }}>
                  1. Loop &mdash; Open Position
                </p>
                <DemoLoop active={isActive(3)} onReset={() => setDemoKey(k => k + 1)} />
                {/* Morpho + Ink logos */}
                <div className="flex items-center justify-center gap-5 mt-auto pt-6">
                  <div className="w-32 h-32 rounded-2xl overflow-hidden shrink-0"><img src="/morpho.jpg" alt="Morpho" className="w-full h-full object-cover" style={{ transform: 'scale(1.8)' }} /></div>
                  <div className="w-32 h-32 rounded-2xl overflow-hidden shrink-0"><img src="/ink.png" alt="Ink" className="w-full h-full object-cover" /></div>
                </div>
              </div>
              <div className="flex flex-col">
                <p className="text-[10px] font-mono font-semibold tracking-widest uppercase mb-3" style={{ color: '#6b6866' }}>
                  2. Position View
                </p>
                <DemoPosition active={isActive(3)} />
              </div>
              <div className="flex flex-col">
                <p className="text-[10px] font-mono font-semibold tracking-widest uppercase mb-3" style={{ color: '#6b6866' }}>
                  3. Unwind &mdash; Close Position
                </p>
                <DemoUnwind active={isActive(3)} onReset={() => setDemoKey(k => k + 1)} />
                {/* Privy + xStocks logos */}
                <div className="flex items-center justify-center gap-5 mt-auto pt-6">
                  <div className="w-32 h-32 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center" style={{ backgroundColor: '#000' }}><img src="/privy.png" alt="Privy" className="w-[75%] h-[75%] object-contain" /></div>
                  <div className="w-32 h-32 rounded-2xl overflow-hidden shrink-0"><img src="/xstocks.jpg" alt="xStocks" className="w-full h-full object-cover" /></div>
                </div>
              </div>
            </div>
          </div>
          <style>{`
            @keyframes pitch-cursor {
              0%, 49% { opacity: 1; }
              50%, 100% { opacity: 0; }
            }
          `}</style>
        </section>

        {/* ═══ SLIDE 4: BUY THE DIP VAULT ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-5xl w-full" style={{ opacity: isActive(4) ? 1 : 0, transform: isActive(4) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <h2 className="text-4xl md:text-5xl font-bold mb-3 leading-tight" style={{ color: '#0a0a0a' }}>
              Orange Dot <span style={{ color: '#16a34a' }}>Vault</span>.
            </h2>
            <p className="text-base mb-6 leading-relaxed" style={{ color: '#6b6866' }}>
              Idle USDC earns yield and Ink points via Tydro. When STRC dips, it auto-buys generational entries.
            </p>

            {/* Real STRC chart with dip zones */}
            <div className="rounded-lg border bg-white p-5 mb-6" style={{ borderColor: '#e5e7eb' }}>
              <BuyDipChart active={isActive(4)} />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="rounded-lg border bg-white p-5" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-3xl font-mono font-bold mb-1" style={{ color: '#16a34a' }}>+10%</div>
                <div className="text-xs font-semibold mb-1" style={{ color: '#0a0a0a' }}>Recovery Yield</div>
                <div className="text-[10px] leading-relaxed" style={{ color: '#6b6866' }}>
                  Last time STRC fell below $95 it recovered within two weeks. Instant 10%+ return on the dip buy.
                </div>
              </div>
              <div className="rounded-lg border bg-white p-5" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-3xl font-mono font-bold mb-1" style={{ color: '#c47a1a' }}>Tydro + Ink</div>
                <div className="text-xs font-semibold mb-1" style={{ color: '#0a0a0a' }}>Idle Yield</div>
                <div className="text-[10px] leading-relaxed" style={{ color: '#6b6866' }}>
                  USDC earns vault yield and Ink chain points while waiting. Your capital is never idle.
                </div>
              </div>
              <div className="rounded-lg border bg-white p-5" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-3xl font-mono font-bold mb-1" style={{ color: '#2d2d2d' }}>Auto-Route</div>
                <div className="text-xs font-semibold mb-1" style={{ color: '#0a0a0a' }}>Liquidation Shield</div>
                <div className="text-[10px] leading-relaxed" style={{ color: '#6b6866' }}>
                  DCA entries are supplied as collateral to Morpho, automatically protecting leveraged positions from liquidation.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SLIDE 5: STRETCH YOUR SAVINGS ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-5xl w-full" style={{ opacity: isActive(5) ? 1 : 0, transform: isActive(5) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight" style={{ color: '#0a0a0a' }}>
              Stretch Your <span style={{ color: '#c47a1a' }}>Savings</span>.
            </h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-4">
                <div className="flex gap-8 pb-2">
                  {[
                    { label: 'Savings Balance', val: '$1,247.83', color: '#0a0a0a' },
                    { label: 'STRC Value', val: '$623.91', color: '#16a34a' },
                    { label: 'T-Bill Value', val: '$623.92', color: '#c47a1a' },
                  ].map((s) => (
                    <div key={s.label}>
                      <p className="text-[9px] font-mono tracking-widest uppercase mb-1" style={{ color: '#6b6866' }}>{s.label}</p>
                      <span className="text-2xl font-mono font-bold" style={{ color: s.color }}>{s.val}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border bg-white p-5 space-y-3" style={{ borderColor: '#e5e7eb' }}>
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-mono tracking-widest uppercase" style={{ color: '#6b6866' }}>Deposit USDC</p>
                    <span className="text-[10px] font-mono" style={{ color: '#6b6866' }}>Balance: <span style={{ color: '#0a0a0a' }}>500.00 USDC</span></span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm" style={{ color: '#6b6866' }}>$</span>
                    <div className="w-full rounded-md border pl-7 pr-16 py-2.5 font-mono text-xl font-semibold" style={{ borderColor: '#d1d5db', color: '#0a0a0a', backgroundColor: '#fafafa' }}>100.00</div>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono" style={{ color: '#6b6866' }}>USDC</span>
                  </div>
                  <div className="flex gap-2">
                    {[20, 50, 100, 250, 500].map((q) => (
                      <div key={q} className="flex-1 rounded-md border py-1.5 text-center text-xs font-mono" style={{ borderColor: q === 100 ? '#0a0a0a' : '#e5e7eb', color: q === 100 ? '#0a0a0a' : '#9ca3af' }}>${q}</div>
                    ))}
                  </div>
                  <div className="rounded-md border p-3 space-y-2" style={{ borderColor: '#e5e7eb', backgroundColor: '#fafafa' }}>
                    <p className="text-[9px] font-mono tracking-widest uppercase" style={{ color: '#6b6866' }}>Allocation</p>
                    <div className="flex justify-between text-xs">
                      <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: '#16a34a' }} />STRC (50%)</span>
                      <span className="font-mono font-medium">$50.00</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: '#c47a1a' }} />Invesco T-Bill (50%)</span>
                      <span className="font-mono font-medium">$50.00</span>
                    </div>
                    <p className="text-[9px] pt-1.5 border-t" style={{ color: '#9ca3af', borderColor: '#e5e7eb' }}>Swapped via CoW Protocol on INK chain</p>
                  </div>
                  <div className="w-full rounded-md py-2.5 text-center text-xs font-medium uppercase tracking-wider text-white" style={{ backgroundColor: '#0a0a0a' }}>Deposit $100.00</div>
                </div>
              </div>
              <div className="rounded-lg border bg-white p-5 space-y-4" style={{ borderColor: '#e5e7eb' }}>
                <div>
                  <p className="text-[9px] font-mono tracking-widest uppercase mb-1" style={{ color: '#6b6866' }}>Rewards Available</p>
                  <p className="text-3xl font-mono font-bold">$12.40</p>
                  <p className="text-[9px] mt-1" style={{ color: '#6b6866' }}>earned from yield on your savings</p>
                </div>
                <p className="text-xs" style={{ color: '#6b6866' }}>Redeem your yield for real gift cards</p>
                <div className="grid grid-cols-2 gap-2">
                  {['Amazon', 'Starbucks', 'Netflix', 'Airbnb'].map((name) => (
                    <div key={name} className="rounded-md border p-3 space-y-1" style={{ borderColor: '#e5e7eb' }}>
                      <span className="text-lg">🎁</span>
                      <p className="text-xs font-semibold">{name}</p>
                      <p className="text-[9px]" style={{ color: '#9ca3af' }}>from $5</p>
                    </div>
                  ))}
                </div>
                <div className="w-full rounded-md py-2 text-center text-xs font-medium uppercase tracking-wider text-white" style={{ backgroundColor: '#0a0a0a' }}>Select a Gift Card</div>
                <p className="text-[9px] text-center" style={{ color: '#9ca3af' }}>Powered by Bitrefill</p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SLIDE 6: VIABILITY ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-4xl w-full" style={{ opacity: isActive(6) ? 1 : 0, transform: isActive(6) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <h2 className="text-4xl md:text-5xl font-bold mb-8 leading-tight" style={{ color: '#0a0a0a' }}>
              A massive market.<br /><span style={{ color: '#c47a1a' }}>1% is enough.</span>
            </h2>
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border bg-white p-6 space-y-2" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-[9px] font-mono tracking-widest uppercase" style={{ color: '#6b6866' }}>STRC Monthly Volume</div>
                <div className="text-4xl font-mono font-bold" style={{ color: '#0a0a0a' }}>$300M</div>
                <p className="text-xs leading-relaxed" style={{ color: '#6b6866' }}>Monthly on-chain trading volume. Deep liquidity for looping at any size.</p>
              </div>
              <div className="rounded-lg border bg-white p-6 space-y-2" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-[9px] font-mono tracking-widest uppercase" style={{ color: '#6b6866' }}>STRC Assets Under Management</div>
                <div className="text-4xl font-mono font-bold" style={{ color: '#0a0a0a' }}>$40B</div>
                <p className="text-xs leading-relaxed" style={{ color: '#6b6866' }}>Total AUM in STRC today. A growing base of holders seeking better yield.</p>
              </div>
              <div className="rounded-lg border-2 p-6 space-y-2" style={{ borderColor: '#c47a1a40', backgroundColor: 'rgba(196,122,26,0.04)' }}>
                <div className="text-[9px] font-mono tracking-widest uppercase" style={{ color: '#c47a1a' }}>1% Capture = Target TVL</div>
                <div className="text-4xl font-mono font-bold" style={{ color: '#c47a1a' }}>$400M</div>
                <p className="text-xs leading-relaxed" style={{ color: '#6b6866' }}>Capturing just 1% of STRC AUM into Spreads vaults. A conservative and achievable target.</p>
              </div>
            </div>
            <div className="rounded-lg border bg-white p-8" style={{ borderColor: '#e5e7eb' }}>
              <h3 className="text-2xl font-bold mb-6" style={{ color: '#0a0a0a' }}>Why users come to Spreads</h3>
              <div className="grid grid-cols-3 gap-6">
                {[
                  { accent: '#e05c00', title: 'Leverage', desc: 'Up to 3.5x on STRC. One click, gasless.' },
                  { accent: '#c47a1a', title: 'Trading', desc: 'Auto buy-the-dip. Generational entries.' },
                  { accent: '#16a34a', title: 'Savings', desc: 'Yield 24/7. Rewards as gift cards.' },
                ].map((c) => (
                  <div key={c.title}>
                    <div className="text-xl font-mono font-bold mb-2" style={{ color: c.accent }}>{c.title}</div>
                    <p className="text-sm leading-relaxed" style={{ color: '#6b6866' }}>{c.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SLIDE 7: IMPACT ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-4xl w-full" style={{ opacity: isActive(7) ? 1 : 0, transform: isActive(7) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <span className="text-[10px] font-mono font-semibold tracking-widest uppercase" style={{ color: '#1a3520' }}>07 — Impact</span>
            <h2 className="text-4xl md:text-5xl font-bold mt-3 mb-3 leading-tight" style={{ color: '#0a0a0a' }}>
              What Spreads brings<br />to <span style={{ color: '#1a3520' }}>xStocks</span>.
            </h2>
            <p className="text-sm mb-10 max-w-2xl leading-relaxed" style={{ color: '#6b6866' }}>
              Spreads is the strategy layer for xStocks. We make STRC better by unlocking what tokenisation uniquely enables — leverage is just the beginning.
            </p>
            <div className="grid md:grid-cols-3 gap-5 mb-10">
              {[
                {
                  num: '01',
                  accent: '#e05c00',
                  title: 'New Distribution Channel',
                  desc: 'Spreads brings a new segment of DeFi-native yield farmers to STRCx — users who would never buy a tokenized stock directly, but will come for 46% APY on leverage.',
                  tag: 'User Acquisition',
                },
                {
                  num: '02',
                  accent: '#7c3aed',
                  title: 'New DeFi Tooling',
                  desc: 'Morpho Blue market, Pyth oracle adapter, ERC-4626 Orange Dot Vault, and CoW batch execution — open infrastructure any Ink protocol can build on top of.',
                  tag: 'Open Infrastructure',
                },
                {
                  num: '03',
                  accent: '#16a34a',
                  title: 'New Strategies',
                  desc: 'Leverage is first. The foundation we\'ve built supports shorting, delta-neutral yield, options-style payoffs — strategies that only exist because STRC is on-chain.',
                  tag: 'Leverage & Beyond',
                },
              ].map((c) => (
                <div key={c.num} className="rounded-lg border bg-white p-6 space-y-3" style={{ borderColor: '#e5e7eb' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono tracking-widest uppercase px-2 py-1 rounded-full" style={{ color: c.accent, backgroundColor: c.accent + '12' }}>{c.tag}</span>
                    <span className="text-2xl font-mono font-bold" style={{ color: c.accent + '30' }}>{c.num}</span>
                  </div>
                  <p className="text-sm font-bold" style={{ color: '#0a0a0a' }}>{c.title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: '#6b6866' }}>{c.desc}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SpreadsLogo size={28} />
                <div>
                  <span className="text-base font-bold tracking-widest uppercase" style={{ color: '#0a0a0a' }}>Spreads</span>
                  <p className="text-xs font-mono mt-0.5" style={{ color: '#6b6866' }}>Stretch your yield. Protect your position. Sleep at night.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <a href="https://x.com/spreads_fi" target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-60" style={{ color: '#6b6866' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                <a href="https://t.me/spreads_fi" target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-60" style={{ color: '#6b6866' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
