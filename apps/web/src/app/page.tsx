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
      <div className="text-xs font-mono text-gray-400 tracking-widest uppercase mt-2">APR</div>
    </div>
  );
}

const TICKER_ITEMS = [
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
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS]; // duplicate for seamless loop
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
      {/* Scrolling ticker */}
      <Ticker />


      {/* Michael Saylor cutout — right side */}
      <img
        src="/saylor.png"
        alt="Michael Saylor"
        className="absolute right-0 bottom-0 h-[88vh] object-contain object-bottom select-none pointer-events-none"
        style={{
          filter: 'drop-shadow(-12px 0 40px rgba(0,0,0,0.10))',
          transform: `translate(${parallax.x * 12}px, ${parallax.y * 6}px)`,
          transition: 'transform 0.15s ease-out',
        }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />

      {/* Bitcoin hand — left side */}
      <img
        src="/bitcoin-hand.png"
        alt=""
        aria-hidden="true"
        className="absolute -left-[12%] bottom-0 h-[72vh] object-contain object-bottom select-none pointer-events-none"
        style={{
          mixBlendMode: 'multiply',
          transform: `translate(${parallax.x * -16}px, ${parallax.y * 8}px)`,
          transition: 'transform 0.15s ease-out',
        }}
      />


      {/* Central card */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-[480px]">

        {/* Spreads logo */}
        <div className="flex items-center gap-2 mb-8">
          <svg width="18" height="22" viewBox="415 379 250 322" xmlns="http://www.w3.org/2000/svg">
            <polygon fill="#1a3520" points="416.8 476.1 525.8 476.4 602 379.7 663.9 380.4 664.2 380.7 662.9 484.1 537.5 484 473 581.2 415.8 580.8 416.8 476.1"/>
            <polygon fill="#1a3520" points="416.8 605.1 525.8 605.4 591.9 508.8 664.2 508.8 662.9 610.4 537.5 613 483 700.3 415.8 699.9 416.8 605.1"/>
          </svg>
          <span className="text-sm font-semibold tracking-widest uppercase">Spreads</span>
        </div>

        {/* Animated APR counter */}
        <AprCounter />

        {/* Headline */}
        <h1 className="text-[3.8rem] font-bold tracking-tight leading-[1.05] mb-5">
          <span style={{ color: '#e05c00' }}>Stretch</span> Your Yield
        </h1>

        <p className="text-base text-gray-400 mb-8 leading-relaxed">
          Turn your STRC dividend into up to 5× more — automatically.
        </p>

        {/* CTA */}
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
      <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200 bg-white/70 backdrop-blur-sm px-8 py-3 flex items-center justify-between z-20">
        <div className="flex items-center gap-6 text-[10px] text-gray-400 tracking-widest uppercase">
          <a href="https://x.com/spreads_fi" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 transition-colors">X</a>
          <a href="https://t.me/spreads_fi" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 transition-colors">Telegram</a>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-400 tracking-wide">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Operational · INK Mainnet
        </div>
      </div>

    </main>
  );
}
