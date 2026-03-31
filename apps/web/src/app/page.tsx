'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

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

      {/* Floating stat labels — scattered like image 9's tickers */}
      <div className="absolute top-[14%] left-[8%] text-xs font-mono text-gray-400 select-none">Base APR</div>
      <div className="absolute top-[18%] left-[8%] text-2xl font-mono font-bold select-none" style={{ color: '#16a34a' }}>11.5%</div>

      <div className="absolute top-[12%] right-[22%] text-xs font-mono text-gray-400 select-none">Max APR at 5×</div>
      <div className="absolute top-[16%] right-[22%] text-2xl font-mono font-bold select-none" style={{ color: '#16a34a' }}>40.7%</div>

      <div className="absolute bottom-[28%] left-[6%] text-xs font-mono text-gray-400 select-none">Dividend yield</div>
      <div className="absolute bottom-[24%] left-[6%] text-sm font-mono font-semibold text-gray-600 select-none">STRC · on-chain</div>

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
        <img src="/strc-logo.png" alt="STRC" className="h-10 mb-6 select-none" />

        {/* APR hook */}
        <div className="flex items-center gap-4 mb-6">
          <span className="text-3xl font-mono font-bold text-gray-400">11.5%</span>
          <span className="text-2xl text-gray-300 font-mono">→</span>
          <span className="text-3xl font-mono font-bold" style={{ color: '#16a34a' }}>40%</span>
        </div>

        {/* Headline */}
        <h1 className="text-[2.8rem] font-bold tracking-tight leading-[1.1] mb-4">
          Your yield,<br />
          <span style={{ color: '#16a34a' }}>multiplied.</span>
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
