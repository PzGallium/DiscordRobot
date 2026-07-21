import { config } from '../config.js';

export function formatCoins(amount: number): string {
  return `${amount.toLocaleString('en-US')} ${config.currencyName}`;
}

export function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
