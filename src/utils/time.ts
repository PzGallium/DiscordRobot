import { config } from '../config.js';

export type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Calendar date string YYYY-MM-DD in the configured timezone. */
export function calendarDateInTimezone(date: Date = new Date(), timeZone = config.dailyTimezone): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getZonedParts(date: Date = new Date(), timeZone = config.dailyTimezone): ZonedDateTimeParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((p) => p.type === type)?.value;
    return Number.parseInt(value ?? '0', 10);
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/** Interpret a wall-clock date/time in the given timezone as a UTC Date. */
export function zonedLocalToDate(
  parts: Omit<ZonedDateTimeParts, 'second'> & { second?: number },
  timeZone = config.dailyTimezone,
): Date {
  const second = parts.second ?? 0;
  const desiredAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, second);
  let utcMs = desiredAsUtc;

  for (let i = 0; i < 3; i++) {
    const shown = getZonedParts(new Date(utcMs), timeZone);
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
    utcMs += desiredAsUtc - shownAsUtc;
  }

  return new Date(utcMs);
}

/** Parse `YYYY-MM-DD` + `HH:mm` or `HH:mm:ss` in the configured timezone. */
export function parseZonedDateTimeInput(
  dateStr: string,
  timeStr: string,
  timeZone = config.dailyTimezone,
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr.trim());
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? '0');

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const date = zonedLocalToDate({ year, month, day, hour, minute, second }, timeZone);
  if (Number.isNaN(date.getTime())) return null;
  return date;
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
