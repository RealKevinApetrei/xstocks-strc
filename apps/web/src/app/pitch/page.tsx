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

// ── Section labels ──────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'hero', label: 'Title' },
  { id: 'problem', label: 'Problem' },
  { id: 'solution', label: 'Solution' },
  { id: 'how', label: 'How' },
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
          <img src="/saylor-bw.png" alt="" aria-hidden className="absolute bottom-0 object-contain object-bottom select-none pointer-events-none"
            style={{ left: '-4%', height: '85vh', zIndex: 5, ...blend, transform: `translate(${parallax.x * 8}px, ${parallax.y * 4}px)`, ...ease, opacity: 0.7 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <img src="/bitcoin-hand.png" alt="" aria-hidden className="absolute select-none pointer-events-none"
            style={{ left: '10%', bottom: '20%', height: '28vh', zIndex: 8, ...blend, transform: `translate(${parallax.x * -18}px, ${parallax.y * 10}px)`, ...ease, opacity: 0.6 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <img src="/hundred-dollar.png" alt="" aria-hidden className="absolute select-none pointer-events-none"
            style={{ right: '3%', top: '25%', width: '22vw', maxWidth: '340px', zIndex: 5, ...blend, transform: `translate(${parallax.x * 20}px, ${parallax.y * -12}px) rotate(-4deg)`, ...ease, opacity: 0.5, filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.08))' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <img src="/saylor-colour.png" alt="" aria-hidden className="absolute bottom-0 object-contain object-bottom select-none pointer-events-none"
            style={{ right: '-4%', height: '85vh', zIndex: 8, ...blend, transform: `translate(${parallax.x * 10}px, ${parallax.y * 5}px)`, ...ease, opacity: 0.7 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />

          <div className="relative flex flex-col items-center text-center max-w-[640px]" style={{ zIndex: 20 }}>
            <div className="flex items-center gap-2.5 mb-8">
              <SpreadsLogo size={24} />
              <span className="text-base font-semibold tracking-widest uppercase" style={{ color: '#0a0a0a' }}>Spreads</span>
            </div>
            <div className="mb-4">
              <span className="inline-block text-[9px] font-mono font-semibold tracking-widest uppercase px-3 py-1.5 rounded-full border"
                style={{ borderColor: '#16a34a40', color: '#16a34a', backgroundColor: 'rgba(22,163,74,0.06)' }}>
                xStocks Hackathon 2025
              </span>
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

        {/* ═══ SLIDE 1: PROBLEM ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-4xl w-full" style={{ opacity: isActive(1) ? 1 : 0, transform: isActive(1) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
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
          <div className="max-w-4xl w-full" style={{ opacity: isActive(2) ? 1 : 0, transform: isActive(2) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <span className="text-[10px] font-mono font-semibold tracking-widest uppercase" style={{ color: '#16a34a' }}>02 &mdash; The Solution</span>
            <h2 className="text-4xl md:text-5xl font-bold mt-3 mb-4 leading-tight" style={{ color: '#0a0a0a' }}>
              One-click <span style={{ color: '#16a34a' }}>leveraged yield</span><br />with built-in protection.
            </h2>
            <div className="rounded-lg border-2 p-6 mb-10" style={{ borderColor: '#16a34a40', backgroundColor: 'rgba(22,163,74,0.04)' }}>
              <p className="text-lg font-medium leading-relaxed" style={{ color: '#0a0a0a' }}>
                Spreads turns a single USDC deposit into a fully automated, leveraged STRC position on Morpho Blue
                &mdash; with a smart vault that buys the dip to protect you from liquidation.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-6">
                <StatCard label="Maximum APY" accent="#16a34a"><AnimatedCounter target={40} suffix="%" active={isActive(2)} /></StatCard>
                <StatCard label="Leverage Options">2x &middot; 3x &middot; 5x</StatCard>
              </div>
              <div className="space-y-6">
                <StatCard label="Transactions per Loop"><AnimatedCounter target={1} active={isActive(2)} /><span className="text-sm font-normal ml-2" style={{ color: '#6b6866' }}>(we handle the rest)</span></StatCard>
                <StatCard label="Liquidation Protection" accent="#16a34a">Automated</StatCard>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SLIDE 3: HOW IT WORKS ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-5xl w-full" style={{ opacity: isActive(3) ? 1 : 0, transform: isActive(3) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <span className="text-[10px] font-mono font-semibold tracking-widest uppercase" style={{ color: '#2d2d2d' }}>03 &mdash; How It Works</span>
            <h2 className="text-4xl md:text-5xl font-bold mt-3 mb-10 leading-tight" style={{ color: '#0a0a0a' }}>
              Three flows. Fully <span style={{ color: '#e05c00' }}>automated</span>.
            </h2>
            <div className="grid md:grid-cols-3 gap-5">
              <AnimatedFlow active={isActive(3)} label="Loop (Open Position)" steps={[
                { n: '01', title: 'Deposit USDC', desc: 'User deposits USDC into their Privy smart wallet.' },
                { n: '02', title: 'Swap to STRCx', desc: 'CoW Protocol swaps USDC to STRCx with zero slippage.' },
                { n: '03', title: 'Supply to Morpho', desc: 'STRCx wrapped and supplied as collateral.' },
                { n: '04', title: 'Borrow & Repeat', desc: 'USDC borrowed against collateral. Cycle repeats up to 5x.' },
              ]} />
              <AnimatedFlow active={isActive(3)} label="Unwind (Close Position)" steps={[
                { n: '01', title: 'Withdraw Collateral', desc: 'Safe amount of wSTRC withdrawn from Morpho.' },
                { n: '02', title: 'Unwrap & Sell', desc: 'wSTRC unwrapped and sold for USDC via CoW.' },
                { n: '03', title: 'Repay Debt', desc: 'USDC used to repay Morpho loan.' },
                { n: '04', title: 'Repeat to Target', desc: 'Iterates until target leverage or full exit.' },
              ]} />
              <AnimatedFlow active={isActive(3)} label="Grid Buy (Protection)" steps={[
                { n: '01', title: 'Price Drops', desc: 'Pyth oracle detects STRC price decline.' },
                { n: '02', title: 'HF Check', desc: 'Health factor drops below safety threshold.' },
                { n: '03', title: 'Vault Deploy', desc: 'USDC withdrawn from protection vault.' },
                { n: '04', title: 'Buy the Dip', desc: 'USDC swapped to STRC and supplied to strengthen position.' },
              ]} />
            </div>
          </div>
        </section>

        {/* ═══ SLIDE 4: WHAT'S UNIQUE ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-4xl w-full" style={{ opacity: isActive(4) ? 1 : 0, transform: isActive(4) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <span className="text-[10px] font-mono font-semibold tracking-widest uppercase" style={{ color: '#7c3aed' }}>04 &mdash; What&apos;s Unique</span>
            <h2 className="text-4xl md:text-5xl font-bold mt-3 mb-10 leading-tight" style={{ color: '#0a0a0a' }}>
              Not just another <span style={{ color: '#7c3aed' }}>yield farm</span>.
            </h2>
            <div className="grid md:grid-cols-2 gap-5">
              {[
                { icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>, bg: '#16a34a15', title: 'Buy-the-Dip Vault', desc: 'No other looping product has automated liquidation protection. Our grid strategy vault monitors Pyth price feeds and autonomously deploys capital to strengthen your position when health factor drops.' },
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
          <div className="max-w-5xl w-full" style={{ opacity: isActive(5) ? 1 : 0, transform: isActive(5) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
            <span className="text-[10px] font-mono font-semibold tracking-widest uppercase" style={{ color: '#e05c00' }}>05 &mdash; Implementation</span>
            <h2 className="text-4xl md:text-5xl font-bold mt-3 mb-10 leading-tight" style={{ color: '#0a0a0a' }}>
              Built on <span style={{ color: '#e05c00' }}>production-grade</span><br />infrastructure.
            </h2>
            <div className="grid md:grid-cols-3 gap-4 mb-8">
              <ArchBlock label="Frontend" accent="#2d2d2d" items={['Next.js 15 App Router', 'Privy Auth + Smart Wallets', 'Real-time SSE Price Stream', 'Responsive Dashboard']} />
              <ArchBlock label="Backend" accent="#e05c00" items={['Express 5 + TypeScript', 'Pyth Oracle Integration', 'CoW Presign Execution', 'Grid Strategy Engine']} />
              <ArchBlock label="On-Chain" accent="#16a34a" items={['Morpho Blue (Ink L2)', 'wSTRC Collateral Vault', 'ERC-4626 Protection Vault', 'Gas-Sponsored UserOps']} />
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
          <div className="max-w-4xl w-full" style={{ opacity: isActive(6) ? 1 : 0, transform: isActive(6) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
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
              <StatCard label="Target Leverage" accent="#e05c00"><AnimatedCounter target={5} suffix="x" active={isActive(6)} /></StatCard>
              <StatCard label="Max APY" accent="#16a34a"><AnimatedCounter target={40} suffix="%" active={isActive(6)} /></StatCard>
              <StatCard label="Gas Cost" accent="#16a34a">$0</StatCard>
              <StatCard label="Time to Loop"><AnimatedCounter target={60} suffix="s" active={isActive(6)} /></StatCard>
            </div>
          </div>
        </section>

        {/* ═══ SLIDE 7: IMPACT ═══ */}
        <section className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-4xl w-full text-center" style={{ opacity: isActive(7) ? 1 : 0, transform: isActive(7) ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.6s ease-out' }}>
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
                { val: <AnimatedCounter target={3} suffix="x" active={isActive(7)} />, color: '#16a34a', title: 'Yield Multiplication', desc: 'Turn 11.5% base APY into 30-40% effective yield through automated leveraged looping.' },
                { val: <AnimatedCounter target={0} suffix=" txns" active={isActive(7)} />, color: '#e05c00', title: 'User Friction', desc: 'Gasless smart wallets eliminate every UX hurdle. No ETH for gas. No manual signing. No complexity.' },
                { val: '24/7', color: '#7c3aed', title: 'Protection', desc: 'Grid strategy vault watches prices around the clock. When STRC dips, it buys automatically to protect your position.' },
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
