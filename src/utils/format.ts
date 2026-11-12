import { getGuildSettings } from '../services/guildSettings.js';

export function formatCoins(amount: number, guildId: string): string {
  return `${amount.toLocaleString('en-US')} ${getGuildSettings(guildId).currencyName}`;
}

export function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
