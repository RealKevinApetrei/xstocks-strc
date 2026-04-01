'use client';

interface SpreadsSpinnerProps {
  size?: number;
  className?: string;
}

export function SpreadsSpinner({ size = 28, className = '' }: SpreadsSpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="415 379 250 322"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Loading"
    >
      <polygon
        className="spreads-spinner-top"
        fill="#1a3520"
        points="416.8 476.1 525.8 476.4 602 379.7 663.9 380.4 664.2 380.7 662.9 484.1 537.5 484 473 581.2 415.8 580.8 416.8 476.1"
      />
      <polygon
        className="spreads-spinner-bottom"
        fill="#1a3520"
        points="416.8 605.1 525.8 605.4 591.9 508.8 664.2 508.8 662.9 610.4 537.5 613 483 700.3 415.8 699.9 416.8 605.1"
      />
    </svg>
  );
}
