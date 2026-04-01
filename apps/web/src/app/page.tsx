'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';

function AprCounter() {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const target = 40;
    const duration = 2000;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.floor(eased * target));
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);

  return (
    <div className="mb-6">
      <div className="text-[8rem] font-mono font-bold leading-none" style={{ color: '#16a34a' }}>
        {display}%
      </div>
      <div className="text-xs font-mono text-gray-400 tracking-widest uppercase mt-2">APY</div>
    </div>
  );
}

const TICKER_ITEMS = [
  { label: '❝', value: 'There is no second best.' },
  { label: '❝', value: 'Bitcoin is the apex property of the human race.' },
  { label: '❝', value: 'If you don\'t own Bitcoin, you don\'t understand it yet.' },
  { label: '❝', value: 'Bitcoin is hope.' },
  { label: '❝', value: 'The best time to buy Bitcoin was 10 years ago. The second best time is now.' },
  { label: '❝', value: 'Bitcoin is a bank in cyberspace, run by incorruptible software.' },
  { label: '❝', value: 'Buy Bitcoin. Ignore the noise.' },
  { label: '❝', value: 'Bitcoin is digital gold, only better in every way.' },
  { label: '❝', value: 'All the money in the world will eventually flow into Bitcoin.' },
];

function Ticker() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="absolute top-0 left-0 right-0 z-30 border-b border-black/8 bg-white/60 backdrop-blur-sm overflow-hidden">
      <div
        className="flex items-center gap-0 py-2.5 whitespace-nowrap"
        style={{ animation: 'ticker-scroll 50s linear infinite', width: 'max-content' }}
      >
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-3 px-8 text-[11px] font-mono">
            <span className="text-gray-300">{item.label}</span>
            <span className="italic text-gray-600">{item.value}</span>
            <span className="text-gray-200 select-none mx-2">—</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const { login, authenticated, ready } = usePrivy();
  const router = useRouter();
  const containerRef = useRef<HTMLElement>(null);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (ready && authenticated) {
      router.push('/dashboard');
    }
  }, [ready, authenticated, router]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setParallax({
      x: (e.clientX - rect.left - rect.width / 2) / rect.width,
      y: (e.clientY - rect.top - rect.height / 2) / rect.height,
    });
  }, []);

  const blend = { mixBlendMode: 'multiply' as const };
  const ease = { transition: 'transform 0.15s ease-out' };

  return (
    <main
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative min-h-screen overflow-hidden flex items-center justify-center"
      style={{
        background: '#f5f4f0',
        backgroundImage: 'linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)',
        backgroundSize: '52px 52px',
        fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      }}
    >
      <Ticker />

      {/* ── LEFT SIDE ── */}

      {/* Saylor B&W — left edge, explicit box so bottom aligns with colour */}
      <img
        src="/saylor-bw.png"
        alt="Michael Saylor"
        className="absolute bottom-0 select-none pointer-events-none"
        style={{
          left: 0,
          bottom: 'calc(-8vh - 104px)',
          width: '30vw',
          height: '100vh',
          objectFit: 'cover',
          objectPosition: 'center top',
          zIndex: 6,
          transform: `translate(${parallax.x * 8}px, ${parallax.y * 4}px)`,
          ...ease,
        }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />

      {/* Bitcoin hand — right edge of B&W Saylor, ~10% overlap into Saylor */}
      <img
        src="/bitcoin-hand.png"
        alt=""
        aria-hidden="true"
        className="absolute select-none pointer-events-none"
        style={{
          left: '4vw',
          bottom: 'calc(15% - 208px)',
          height: '52vh',
          zIndex: 5,
          ...blend,
          transform: `translate(${parallax.x * -18}px, ${parallax.y * 10}px)`,
          ...ease,
        }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />

      {/* ── RIGHT SIDE ── */}

      {/* $100 bill — left edge of colour Saylor, ~10% overlap into Saylor */}
      <img
        src="/hundred-dollar.png"
        alt=""
        aria-hidden="true"
        className="absolute select-none pointer-events-none"
        style={{
          right: '14vw',
          top: 'calc(30% + 130px)',
          width: '28.6vw',
          maxWidth: '442px',
          zIndex: 3,
          ...blend,
          transform: `translate(${parallax.x * 20}px, ${parallax.y * -12}px) rotate(-4deg)`,
          ...ease,
          filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.10))',
        }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />

      {/* Saylor colour — right edge, explicit box so bottom aligns with B&W */}
      <img
        src="/saylor-colour.png"
        alt="Michael Saylor"
        className="absolute select-none pointer-events-none"
        style={{
          right: 0,
          bottom: -104,
          width: '30vw',
          height: '100vh',
          objectFit: 'cover',
          objectPosition: 'center top',
          zIndex: 14,
          transform: `translate(${parallax.x * 10}px, ${parallax.y * 5}px)`,
          ...ease,
        }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />

      {/* ── LARGE ANIMATED SPREADS WATERMARK ── */}
      <div
        className="absolute select-none pointer-events-none"
        style={{
          zIndex: 12,
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) translate(${parallax.x * -6}px, ${parallax.y * -4}px)`,
          ...ease,
          opacity: 0.04,
        }}
      >
        <svg width="480" height="590" viewBox="415 379 250 322" xmlns="http://www.w3.org/2000/svg">
          <polygon className="spreads-spinner-top" fill="#1a3520" points="416.8 476.1 525.8 476.4 602 379.7 663.9 380.4 664.2 380.7 662.9 484.1 537.5 484 473 581.2 415.8 580.8 416.8 476.1"/>
          <polygon className="spreads-spinner-bottom" fill="#1a3520" points="416.8 605.1 525.8 605.4 591.9 508.8 664.2 508.8 662.9 610.4 537.5 613 483 700.3 415.8 699.9 416.8 605.1"/>
        </svg>
      </div>

      {/* ── CENTRAL CONTENT ── */}
      <div className="relative flex flex-col items-center text-center px-6 max-w-[480px]" style={{ zIndex: 20 }}>

        {/* Spreads logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <svg width="22" height="27" viewBox="415 379 250 322" xmlns="http://www.w3.org/2000/svg">
            <polygon className="spreads-spinner-top" fill="#1a3520" points="416.8 476.1 525.8 476.4 602 379.7 663.9 380.4 664.2 380.7 662.9 484.1 537.5 484 473 581.2 415.8 580.8 416.8 476.1"/>
            <polygon className="spreads-spinner-bottom" fill="#1a3520" points="416.8 605.1 525.8 605.4 591.9 508.8 664.2 508.8 662.9 610.4 537.5 613 483 700.3 415.8 699.9 416.8 605.1"/>
          </svg>
          <span className="text-base font-semibold tracking-widest uppercase">Spreads</span>
        </div>

        <AprCounter />

        <h1 className="text-[3.8rem] font-bold tracking-tight leading-[1.05] mb-5">
          <span style={{ color: '#e05c00' }}>Stretch</span> Your Yield
        </h1>

        <p className="text-base text-gray-400 mb-8 leading-relaxed">
          Turn your STRC dividend into up to 5× more — automatically.
        </p>

        <button
          onClick={login}
          disabled={!ready}
          className="w-full max-w-[300px] rounded-lg py-4 text-sm font-semibold text-white tracking-widest uppercase transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: '#1a1a1a' }}
        >
          {ready ? 'Connect Wallet' : 'Loading...'}
        </button>
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200 bg-white/70 backdrop-blur-sm px-8 py-3 flex items-center justify-between" style={{ zIndex: 30 }}>
        <div className="flex items-center gap-2">
          <svg width="14" height="18" viewBox="415 379 250 322" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <polygon fill="#1a3520" points="416.8 476.1 525.8 476.4 602 379.7 663.9 380.4 664.2 380.7 662.9 484.1 537.5 484 473 581.2 415.8 580.8 416.8 476.1"/>
            <polygon fill="#1a3520" points="416.8 605.1 525.8 605.4 591.9 508.8 664.2 508.8 662.9 610.4 537.5 613 483 700.3 415.8 699.9 416.8 605.1"/>
          </svg>
          <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-700">Spreads</span>
        </div>
        <div className="flex items-center gap-3">
          <a href="https://x.com/spreads_fi" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </a>
          <a href="https://t.me/spreads_fi" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
          </a>
        </div>
      </div>

    </main>
  );
}
