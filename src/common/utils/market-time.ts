export const NSE_TIMEZONE = 'Asia/Kolkata';

export interface ZonedMarketClock {
  readonly marketDate: string;
  readonly hour: number;
  readonly minute: number;
  readonly weekday: number;
  readonly hhmm: string;
}

export function marketClock(now = new Date(), timezone = NSE_TIMEZONE): ZonedMarketClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const hour = Number(value('hour'));
  const minute = Number(value('minute'));
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    marketDate: `${value('year')}-${value('month')}-${value('day')}`,
    hour,
    minute,
    weekday: weekdays[value('weekday')] ?? -1,
    hhmm: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

export function isWeekday(clock: ZonedMarketClock): boolean {
  return clock.weekday >= 1 && clock.weekday <= 5;
}

export function timeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid HH:mm time: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isWithinTimeRange(value: string, start: string, end: string): boolean {
  const minutes = timeToMinutes(value);
  return minutes >= timeToMinutes(start) && minutes <= timeToMinutes(end);
}

export function subtractCalendarDays(marketDate: string, days: number): string {
  const value = new Date(`${marketDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export function marketDateUtcBounds(marketDate: string): { start: Date; end: Date } {
  const start = new Date(`${marketDate}T00:00:00+05:30`);
  const next = new Date(`${marketDate}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = new Date(`${next.toISOString().slice(0, 10)}T00:00:00+05:30`);
  return { start, end };
}
