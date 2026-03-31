'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

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
      <div className="text-[5rem] font-mono font-bold leading-none" style={{ color: '#16a34a' }}>
        {display}%
      </div>
      <div className="text-xs font-mono text-gray-400 tracking-widest uppercase mt-1">APR</div>
    </div>
  );
}

export default function Home() {
  const { login, authenticated, ready } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && authenticated) {
      router.push('/dashboard');
    }
  }, [ready, authenticated, router]);

  return (
    <main className="relative min-h-screen overflow-hidden flex items-center justify-center" style={{
      background: '#f5f4f0',
      backgroundImage: 'linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)',
      backgroundSize: '52px 52px',
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    }}>

      {/* Michael Saylor cutout — right side. Add saylor.png to apps/web/public/ */}
      <img
        src="/saylor.png"
        alt="Michael Saylor"
        className="absolute right-0 bottom-0 h-[90vh] object-contain object-bottom select-none pointer-events-none"
        style={{ filter: 'drop-shadow(-12px 0 40px rgba(0,0,0,0.10))' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />

      {/* Bitcoin stack — bottom left. Add bitcoin-stack.png to apps/web/public/ */}
      <img
        src="/bitcoin-stack.png"
        alt=""
        aria-hidden="true"
        className="absolute left-4 bottom-0 h-[40vh] object-contain object-bottom select-none pointer-events-none"
        style={{ filter: 'drop-shadow(4px 0 20px rgba(0,0,0,0.10))' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />

      {/* Chart going up — top left. Add chart-up.png to apps/web/public/ */}
      <img
        src="/chart-up.png"
        alt=""
        aria-hidden="true"
        className="absolute left-[10%] top-[6%] h-[26vh] object-contain select-none pointer-events-none opacity-75"
        style={{ transform: 'rotate(-5deg)', filter: 'drop-shadow(2px 2px 12px rgba(0,0,0,0.08))' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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

        {/* STRC logo */}
        <img src="/strc-logo.png" alt="STRC" className="h-10 mb-8 select-none" />

        {/* Animated APR counter */}
        <AprCounter />

        {/* Headline */}
        <h1 className="text-[2.8rem] font-bold tracking-tight leading-[1.1] mb-4">
          <span style={{ color: '#e05c00' }}>Stretch</span> Your Yield
        </h1>

        <p className="text-sm text-gray-400 mb-8 leading-relaxed">
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
