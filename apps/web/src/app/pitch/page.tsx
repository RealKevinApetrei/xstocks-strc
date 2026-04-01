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

function DemoLoop({ active }: { active: boolean }) {
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
            {[2, 3, 5].map((lev) => (
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
          <div className="rounded-md py-2.5 text-center text-sm font-medium transition-colors" style={{ backgroundColor: '#f0eeea', color: '#0a0a0a' }}>
            Start New Loop
          </div>
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

function DemoUnwind({ active }: { active: boolean }) {
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
          <div className="rounded-md py-2.5 text-center text-sm font-medium" style={{ backgroundColor: '#f0eeea', color: '#0a0a0a' }}>
            Done
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section labels ──────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'hero', label: 'Title' },
  { id: 'strc', label: 'STRC' },
  { id: 'problem', label: 'Problem' },
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
              Automated leveraged looping on Morpho Blue with smart liquidation protection.
            </p>
            <p className="text-sm font-mono font-semibold mb-10" style={{ color: '#16a34a' }}>
              Up to 40% APY on STRC &mdash; one click.
            </p>
            <div className="flex items-center gap-6 text-xs" style={{ color: '#6b6866' }}>
              {[
                { label: 'Morpho Blue', color: '#16a34a' },
                { label: 'CoW Protocol', color: '#e05c00' },
                { label: 'Ink Chain', color: '#2d2d2d' },
                { label: 'Privy', color: '#7c3aed' },
              ].map((p) => (
                <span key={p.label} className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ SLIDE 1: WHAT IS STRC ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-4xl w-full" style={{ opacity: isActive(1) ? 1 : 0, transform: isActive(1) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight" style={{ color: '#0a0a0a' }}>
              What is <span style={{ color: '#e05c00' }}>STRC</span>?
            </h2>

            <div className="rounded-lg border-2 p-6 mb-8" style={{ borderColor: '#e05c0040', backgroundColor: 'rgba(224,92,0,0.04)' }}>
              <p className="text-lg font-medium leading-relaxed" style={{ color: '#0a0a0a' }}>
                STRC is a <span className="font-bold">preferred share</span> issued by
                Strategy (formerly MicroStrategy) &mdash; the company that pioneered the corporate Bitcoin treasury
                strategy, now holding <span className="font-bold">over 500,000 BTC</span>.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              {/* How STRC works */}
              <div className="rounded-lg border bg-white p-5 space-y-3" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#0a0a0a' }}>How STRC Works</div>
                <div className="space-y-2.5">
                  {[
                    { label: 'Soft-pegged to $100', desc: 'Preferred share with a stable $100 par value, unlike volatile common equity.' },
                    { label: '11.5% dividend yield', desc: 'Paid from cash flows generated by Strategy\'s BTC holdings and operations.' },
                    { label: 'Convertible to MSTR', desc: 'Can be converted to common shares at a fixed ratio, creating a price floor.' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: '#e05c00' }} />
                      <div>
                        <span className="text-xs font-semibold" style={{ color: '#0a0a0a' }}>{item.label}</span>
                        <span className="text-xs" style={{ color: '#6b6866' }}> &mdash; {item.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Why it matters */}
              <div className="rounded-lg border bg-white p-5 space-y-3" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#0a0a0a' }}>Why It&apos;s Interesting</div>
                <div className="space-y-2.5">
                  {[
                    { label: '$40B+ market cap', desc: 'Massive liquidity pool with institutional and retail holders worldwide.' },
                    { label: 'BTC exposure + yield', desc: 'Indirect Bitcoin exposure with consistent income \u2014 rare in crypto.' },
                    { label: 'Huge retail demand', desc: 'Millions of MSTR/STRC holders looking for better yield on their positions.' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: '#16a34a' }} />
                      <div>
                        <span className="text-xs font-semibold" style={{ color: '#0a0a0a' }}>{item.label}</span>
                        <span className="text-xs" style={{ color: '#6b6866' }}> &mdash; {item.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-8">
              <div className="rounded-lg border bg-white p-5" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-3xl font-mono font-bold mb-2" style={{ color: '#e05c00' }}>
                  <AnimatedCounter target={40} prefix="$" suffix="B" active={isActive(1)} />
                </div>
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#0a0a0a' }}>Market Cap</div>
              </div>
              <div className="rounded-lg border bg-white p-5" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-3xl font-mono font-bold mb-2" style={{ color: '#16a34a' }}>
                  <AnimatedCounter target={11.5} suffix="%" decimals={1} active={isActive(1)} />
                </div>
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#0a0a0a' }}>Dividend Yield</div>
              </div>
              <div className="rounded-lg border bg-white p-5" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-3xl font-mono font-bold mb-2" style={{ color: '#2d2d2d' }}>$100</div>
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#0a0a0a' }}>Soft Peg</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 h-px" style={{ backgroundColor: '#e5e7eb' }} />
              <p className="text-sm font-medium text-center" style={{ color: '#0a0a0a' }}>
                Tokenized STRC on Ink chain.
                <br />
                <span className="font-bold" style={{ color: '#e05c00' }}>Nothing like this exists on-chain. Until now.</span>
              </p>
              <div className="flex-1 h-px" style={{ backgroundColor: '#e5e7eb' }} />
            </div>
          </div>
        </section>

        {/* ═══ SLIDE 2: PROBLEM ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-4xl w-full" style={{ opacity: isActive(2) ? 1 : 0, transform: isActive(2) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <span className="text-[10px] font-mono font-semibold tracking-widest uppercase" style={{ color: '#d93030' }}>01 &mdash; The Problem</span>
            <h2 className="text-4xl md:text-5xl font-bold mt-3 mb-8 leading-tight" style={{ color: '#0a0a0a' }}>
              STRC yields are <span style={{ color: '#d93030' }}>capped</span> at<br />single digits.
            </h2>
            <div className="grid md:grid-cols-3 gap-4 mb-10">
              {[
                { stat: '11.5%', text: 'Base STRC staking APY. Good \u2014 but not enough for serious capital deployment.' },
                { stat: 'Manual', text: 'Leveraged looping requires 10+ manual transactions. One mistake can cost you the position.' },
                { stat: 'Liquidation', text: 'Leveraged positions risk liquidation with zero protection. Sleep tight.' },
              ].map((c) => (
                <div key={c.stat} className="rounded-lg border bg-white p-5 space-y-3" style={{ borderColor: '#e5e7eb' }}>
                  <div className="text-2xl font-mono font-bold" style={{ color: '#d93030' }}>{c.stat}</div>
                  <div className="text-xs leading-relaxed" style={{ color: '#6b6866' }}>{c.text}</div>
                </div>
              ))}
            </div>
            <div className="rounded-lg border-2 border-dashed p-6" style={{ borderColor: '#d9303040' }}>
              <p className="text-sm leading-relaxed" style={{ color: '#0a0a0a' }}>
                <span className="font-bold">The gap:</span> DeFi users want leveraged STRC exposure with higher yield,
                but the process is complex, risky, and offers no safety net. There&apos;s no product that automates leveraged
                looping <em>and</em> protects positions from liquidation.
              </p>
            </div>
          </div>
        </section>

        {/* ═══ SLIDE 2: SOLUTION ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-4xl w-full" style={{ opacity: isActive(3) ? 1 : 0, transform: isActive(3) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <span className="text-[10px] font-mono font-semibold tracking-widest uppercase" style={{ color: '#16a34a' }}>02 &mdash; The Solution</span>
            <h2 className="text-4xl md:text-5xl font-bold mt-3 mb-4 leading-tight" style={{ color: '#0a0a0a' }}>
              One-click <span style={{ color: '#16a34a' }}>leveraged yield</span><br />with built-in protection.
            </h2>
            <div className="rounded-lg border-2 p-6 mb-10" style={{ borderColor: '#16a34a40', backgroundColor: 'rgba(22,163,74,0.04)' }}>
              <p className="text-lg font-medium leading-relaxed" style={{ color: '#0a0a0a' }}>
                Spreads turns a single USDC deposit into a fully automated, leveraged STRC position on Morpho Blue
                &mdash; with the Buy the Dip Vault that automatically protects you from liquidation.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-6">
                <StatCard label="Maximum APY" accent="#16a34a"><AnimatedCounter target={40} suffix="%" active={isActive(3)} /></StatCard>
                <StatCard label="Leverage Options">2x &middot; 3x &middot; 5x</StatCard>
              </div>
              <div className="space-y-6">
                <StatCard label="Transactions per Loop"><AnimatedCounter target={1} active={isActive(3)} /><span className="text-sm font-normal ml-2" style={{ color: '#6b6866' }}>(we handle the rest)</span></StatCard>
                <StatCard label="Liquidation Protection" accent="#16a34a">Automated</StatCard>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SLIDE 3: HOW IT WORKS — LIVE DEMO ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-6xl w-full" style={{ opacity: isActive(4) ? 1 : 0, transform: isActive(4) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <span className="text-[10px] font-mono font-semibold tracking-widest uppercase" style={{ color: '#2d2d2d' }}>03 &mdash; Live Demo</span>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 mb-6 leading-tight" style={{ color: '#0a0a0a' }}>
              Watch it <span style={{ color: '#e05c00' }}>work</span>.
            </h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] font-mono font-semibold tracking-widest uppercase mb-3" style={{ color: '#6b6866' }}>
                  1. Loop &mdash; Open Position
                </p>
                <DemoLoop active={isActive(4)} />
              </div>
              <div>
                <p className="text-[10px] font-mono font-semibold tracking-widest uppercase mb-3" style={{ color: '#6b6866' }}>
                  2. Position View
                </p>
                <DemoPosition active={isActive(4)} />
              </div>
              <div>
                <p className="text-[10px] font-mono font-semibold tracking-widest uppercase mb-3" style={{ color: '#6b6866' }}>
                  3. Unwind &mdash; Close Position
                </p>
                <DemoUnwind active={isActive(4)} />
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

        {/* ═══ SLIDE 4: WHAT'S UNIQUE ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-4xl w-full" style={{ opacity: isActive(5) ? 1 : 0, transform: isActive(5) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <span className="text-[10px] font-mono font-semibold tracking-widest uppercase" style={{ color: '#7c3aed' }}>04 &mdash; What&apos;s Unique</span>
            <h2 className="text-4xl md:text-5xl font-bold mt-3 mb-10 leading-tight" style={{ color: '#0a0a0a' }}>
              Not just another <span style={{ color: '#7c3aed' }}>yield farm</span>.
            </h2>
            <div className="grid md:grid-cols-2 gap-5">
              {[
                { icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>, bg: '#16a34a15', title: 'Buy the Dip Vault', desc: 'No other looping product has automated liquidation protection. The Buy the Dip Vault monitors Pyth price feeds and autonomously deploys capital to strengthen your position when health factor drops.' },
                { icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e05c00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4"/><path d="M12 16V8"/></svg>, bg: '#e05c0015', title: 'One-Click Looping', desc: 'Deposit USDC, pick leverage, done. Spreads handles wrapping, supplying, borrowing, swapping, and iterating \u2014 across 10+ on-chain transactions \u2014 in a single user action.' },
                { icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2d2d2d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>, bg: '#2d2d2d15', title: 'Gasless Smart Wallets', desc: 'Privy Kernel smart wallets with gas sponsorship. Users never need to hold ETH/INK for gas. Abstract away all blockchain complexity \u2014 it feels like using a fintech app.' },
                { icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, bg: '#7c3aed15', title: 'CoW MEV Protection', desc: "Every swap uses CoW Protocol's batch auction system with presigned orders \u2014 protecting users from MEV extraction and ensuring best execution price across all iterations." },
              ].map((c) => (
                <div key={c.title} className="rounded-lg border bg-white p-6" style={{ borderColor: '#e5e7eb' }}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: c.bg }}>{c.icon}</div>
                    <span className="text-sm font-bold" style={{ color: '#0a0a0a' }}>{c.title}</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: '#6b6866' }}>{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ SLIDE 5: ARCHITECTURE ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-5xl w-full" style={{ opacity: isActive(6) ? 1 : 0, transform: isActive(6) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <span className="text-[10px] font-mono font-semibold tracking-widest uppercase" style={{ color: '#e05c00' }}>05 &mdash; Implementation</span>
            <h2 className="text-4xl md:text-5xl font-bold mt-3 mb-10 leading-tight" style={{ color: '#0a0a0a' }}>
              Built on <span style={{ color: '#e05c00' }}>production-grade</span><br />infrastructure.
            </h2>
            <div className="grid md:grid-cols-3 gap-4 mb-8">
              <ArchBlock label="Frontend" accent="#2d2d2d" items={['Next.js 15 App Router', 'Privy Auth + Smart Wallets', 'Real-time SSE Price Stream', 'Responsive Dashboard']} />
              <ArchBlock label="Backend" accent="#e05c00" items={['Express 5 + TypeScript', 'Pyth Oracle Integration', 'CoW Presign Execution', 'Grid Strategy Engine']} />
              <ArchBlock label="On-Chain" accent="#16a34a" items={['Morpho Blue (Ink L2)', 'wSTRC Collateral Market', 'Buy the Dip Vault (ERC-4626)', 'Gas-Sponsored UserOps']} />
            </div>
            <div className="rounded-lg border bg-white p-6" style={{ borderColor: '#e5e7eb' }}>
              <div className="text-[10px] font-mono font-bold tracking-widest uppercase mb-5" style={{ color: '#6b6866' }}>Execution Flow</div>
              <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
                {[
                  { label: 'User', sub: 'USDC Deposit', color: '#2d2d2d' },
                  { label: 'Privy', sub: 'Smart Wallet', color: '#7c3aed' },
                  { label: 'CoW', sub: 'USDC \u2192 STRC', color: '#e05c00' },
                  { label: 'wSTRC', sub: 'Wrap Token', color: '#6b6866' },
                  { label: 'Morpho', sub: 'Supply + Borrow', color: '#16a34a' },
                  { label: 'CoW', sub: 'USDC \u2192 STRC', color: '#e05c00' },
                  { label: 'Loop', sub: 'Repeat N\u00d7', color: '#2d2d2d' },
                ].map((step, i, arr) => (
                  <div key={i} className="flex items-center gap-2 shrink-0">
                    <div className="text-center">
                      <div className="w-14 h-14 rounded-lg border-2 flex items-center justify-center text-[10px] font-mono font-bold mb-1" style={{ borderColor: step.color, color: step.color }}>{step.label}</div>
                      <div className="text-[8px] font-mono" style={{ color: '#6b6866' }}>{step.sub}</div>
                    </div>
                    {i < arr.length - 1 && (
                      <svg width="20" height="10" viewBox="0 0 20 10" className="shrink-0 -mt-4"><path d="M0 5 L15 5 M12 2 L15 5 L12 8" fill="none" stroke="#d1d5db" strokeWidth="1.5" /></svg>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SLIDE 6: VIABILITY ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-4xl w-full" style={{ opacity: isActive(7) ? 1 : 0, transform: isActive(7) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <span className="text-[10px] font-mono font-semibold tracking-widest uppercase" style={{ color: '#c47a1a' }}>06 &mdash; Viability &amp; Uptake</span>
            <h2 className="text-4xl md:text-5xl font-bold mt-3 mb-10 leading-tight" style={{ color: '#0a0a0a' }}>
              Real yield. Real <span style={{ color: '#c47a1a' }}>demand</span>.
            </h2>
            <div className="grid md:grid-cols-2 gap-5 mb-8">
              <div className="rounded-lg border bg-white p-6 space-y-4" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#0a0a0a' }}>Market Opportunity</div>
                <div className="space-y-3">
                  {[
                    ['STRC Market Cap', '$80B+'],
                    ['Morpho Blue TVL', '$4B+'],
                    ['CoW Protocol Volume', '$45B+ cumulative'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span style={{ color: '#6b6866' }}>{k}</span>
                      <span className="font-mono font-semibold">{v}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs border-t pt-3" style={{ borderColor: '#e5e7eb' }}>
                    <span style={{ color: '#6b6866' }}>Ink Chain Status</span>
                    <span className="font-mono font-semibold" style={{ color: '#16a34a' }}>Live Mainnet</span>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border bg-white p-6 space-y-4" style={{ borderColor: '#e5e7eb' }}>
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#0a0a0a' }}>Growth Drivers</div>
                <div className="space-y-3">
                  {['STRC dividend holders seeking yield amplification', 'DeFi users wanting one-click leverage', 'Risk-aware investors needing liquidation protection', 'Ink ecosystem growth driving new users to L2'].map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs">
                      <div className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5" style={{ borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.08)' }}>
                        <span className="text-[8px] font-mono font-bold" style={{ color: '#16a34a' }}>{i + 1}</span>
                      </div>
                      <span style={{ color: '#0a0a0a' }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              <StatCard label="Target Leverage" accent="#e05c00"><AnimatedCounter target={5} suffix="x" active={isActive(7)} /></StatCard>
              <StatCard label="Max APY" accent="#16a34a"><AnimatedCounter target={40} suffix="%" active={isActive(7)} /></StatCard>
              <StatCard label="Gas Cost" accent="#16a34a">$0</StatCard>
              <StatCard label="Time to Loop"><AnimatedCounter target={60} suffix="s" active={isActive(7)} /></StatCard>
            </div>
          </div>
        </section>

        {/* ═══ SLIDE 7: IMPACT ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-4xl w-full text-center" style={{ opacity: isActive(8) ? 1 : 0, transform: isActive(8) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <span className="text-[10px] font-mono font-semibold tracking-widest uppercase" style={{ color: '#1a3520' }}>07 &mdash; Impact</span>
            <h2 className="text-4xl md:text-5xl font-bold mt-3 mb-6 leading-tight" style={{ color: '#0a0a0a' }}>
              What Spreads means<br />for <span style={{ color: '#1a3520' }}>xStocks</span>.
            </h2>
            <p className="text-base mb-12 max-w-xl mx-auto leading-relaxed" style={{ color: '#6b6866' }}>
              Spreads demonstrates that leveraged DeFi can be accessible, safe, and automated &mdash;
              bringing institutional-grade yield strategies to everyday users.
            </p>
            <div className="grid md:grid-cols-3 gap-5 mb-16 text-left">
              {[
                { val: <AnimatedCounter target={3} suffix="x" active={isActive(8)} />, color: '#16a34a', title: 'Yield Multiplication', desc: 'Turn 11.5% base APY into 30-40% effective yield through automated leveraged looping.' },
                { val: <AnimatedCounter target={0} suffix=" txns" active={isActive(8)} />, color: '#e05c00', title: 'User Friction', desc: 'Gasless smart wallets eliminate every UX hurdle. No ETH for gas. No manual signing. No complexity.' },
                { val: '24/7', color: '#7c3aed', title: 'Protection', desc: 'Buy the Dip Vault watches prices around the clock. When STRC dips, it buys automatically to protect your position.' },
              ].map((c) => (
                <div key={c.title} className="rounded-lg border bg-white p-6" style={{ borderColor: '#e5e7eb' }}>
                  <div className="text-4xl font-mono font-bold mb-3" style={{ color: c.color }}>{c.val}</div>
                  <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#0a0a0a' }}>{c.title}</div>
                  <p className="text-xs leading-relaxed" style={{ color: '#6b6866' }}>{c.desc}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col items-center gap-6">
              <div className="flex items-center gap-3">
                <SpreadsLogo size={32} />
                <span className="text-xl font-bold tracking-widest uppercase" style={{ color: '#0a0a0a' }}>Spreads</span>
              </div>
              <p className="text-sm font-mono" style={{ color: '#6b6866' }}>
                Stretch your yield. Protect your position. Sleep at night.
              </p>
              <div className="flex items-center gap-4 mt-2">
                <a href="https://x.com/spreads_fi" target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-60" style={{ color: '#6b6866' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                <a href="https://t.me/spreads_fi" target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-60" style={{ color: '#6b6866' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
