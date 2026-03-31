import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBigInt(value: string | bigint, decimals: number = 18, displayDecimals: number = 4): string {
  const bn = typeof value === 'string' ? BigInt(value) : value;
  const divisor = 10n ** BigInt(decimals);
  const whole = bn / divisor;
  const fraction = bn % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, displayDecimals);
  return `${whole}.${fractionStr}`;
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}
