import { config } from '../config.js';

/** Calendar date string YYYY-MM-DD in the configured timezone. */
export function calendarDateInTimezone(date: Date = new Date(), timeZone = config.dailyTimezone): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function toSqliteDatetime(date: Date = new Date()): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

export function fromSqliteDatetime(value: string): Date {
  // Stored as UTC-ish ISO without Z; treat as UTC
  if (value.includes('T')) return new Date(value.endsWith('Z') ? value : `${value}Z`);
  return new Date(`${value.replace(' ', 'T')}Z`);
}

export function discordTimestamp(date: Date, style: 'R' | 'F' | 'f' = 'R'): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}
