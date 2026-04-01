'use client';

import { useEffect, useState } from 'react';

interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

export function SpreadsToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    function handler(e: Event) {
      const { message, type = 'success' } = (e as CustomEvent).detail;
      const id = Date.now();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    }
    document.addEventListener('spreads-toast', handler);
    return () => document.removeEventListener('spreads-toast', handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((toast, i) => (
        <div
          key={toast.id}
          className="toast-in flex items-center gap-3 rounded-lg border border-border bg-card shadow-lg px-5 py-3.5 min-w-[280px] max-w-[420px]"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          {/* Spreads mark */}
          <svg width="12" height="16" viewBox="415 379 250 322" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="shrink-0">
            <polygon fill="#1a3520" points="416.8 476.1 525.8 476.4 602 379.7 663.9 380.4 664.2 380.7 662.9 484.1 537.5 484 473 581.2 415.8 580.8 416.8 476.1"/>
            <polygon fill="#1a3520" points="416.8 605.1 525.8 605.4 591.9 508.8 664.2 508.8 662.9 610.4 537.5 613 483 700.3 415.8 699.9 416.8 605.1"/>
          </svg>
          <p className="text-xs font-mono text-foreground">{toast.message}</p>
          {toast.type === 'success' && (
            <span className="ml-auto text-[10px] font-mono font-semibold text-success shrink-0">+</span>
          )}
        </div>
      ))}
    </div>
  );
}
