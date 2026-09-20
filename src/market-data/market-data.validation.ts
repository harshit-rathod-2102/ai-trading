import { BadRequestException } from '@nestjs/common';
import { ValidateBy } from 'class-validator';
import Decimal from 'decimal.js';
import { InstrumentType } from '../common/enums/instrument-type.enum';
import { PRICE_PATTERN } from '../common/utils/price';
import { ProviderCandle } from '../providers/market-data/models/provider-candle';
import { TradingCalendar } from '../providers/market-data/models/market-data-request';
import { marketClock } from '../common/utils/market-time';

export function isSessionDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const millis = Date.parse(value + 'T00:00:00.000Z');
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === value;
}

export function IsSessionDate(): PropertyDecorator {
  return ValidateBy({ name: 'isSessionDate', validator: {
    validate: isSessionDate,
    defaultMessage: () => '$property must be a real calendar date in YYYY-MM-DD format',
  } });
}

export function marketDate(now = new Date()): string {
  return marketClock(now).marketDate;
}

export function assertRange(from: string, to: string, now = new Date()): void {
  if (!isSessionDate(from) || !isSessionDate(to) || from > to ||
      from < '2000-01-01' || to > marketDate(now) ||
      (Date.parse(to) - Date.parse(from)) / 86400000 > 365) {
    throw new BadRequestException('Use an ordered date range since 2000, at most 366 days, ending no later than today in Asia/Kolkata');
  }
}

export function calendarIssues(calendar: TradingCalendar): string[] {
  if (!calendar || typeof calendar.source !== 'string' || !calendar.source.trim() ||
      typeof calendar.isSynthetic !== 'boolean' ||
      !isSessionDate(calendar.coverageFrom) || !isSessionDate(calendar.coverageTo) ||
      calendar.coverageFrom > calendar.coverageTo || !Array.isArray(calendar.sessions)) {
    return ['Invalid provider calendar metadata'];
  }
  const dates = new Set<string>();
  const issues: string[] = [];
  for (const session of calendar.sessions) {
    if (!session || !isSessionDate(session.date) || session.date < calendar.coverageFrom ||
        session.date > calendar.coverageTo || dates.has(session.date) ||
        typeof session.closeAt !== 'string' || !/Z$/.test(session.closeAt) ||
        !Number.isFinite(Date.parse(session.closeAt)) ||
        marketDate(new Date(session.closeAt)) !== session.date) {
      issues.push('Invalid or duplicate provider calendar session');
    } else dates.add(session.date);
  }
  return issues;
}

export function expectedSessions(calendar: TradingCalendar, from: string, to: string, now = new Date()): string[] {
  return calendar.sessions.filter(session => session.date >= from && session.date <= to &&
    Date.parse(session.closeAt) <= now.getTime()).map(session => session.date).sort();
}

type OhlcvBar = Pick<
  ProviderCandle,
  'sessionDate' | 'open' | 'high' | 'low' | 'close' | 'volume'
>;

export function barIssues(bar: OhlcvBar, type: InstrumentType): string[] {
  if (!bar || typeof bar !== 'object') return ['Candle must be an object'];
  const issues: string[] = [];
  if (!isSessionDate(bar.sessionDate)) issues.push('Invalid session date');
  const prices = [bar.open, bar.high, bar.low, bar.close];
  if (!prices.every(price => typeof price === 'string' && PRICE_PATTERN.test(price))) {
    issues.push('OHLC must be positive decimal strings within NUMERIC(18,4)');
  } else if (new Decimal(bar.high).lt(bar.low) || new Decimal(bar.high).lt(bar.open) ||
    new Decimal(bar.high).lt(bar.close) || new Decimal(bar.low).gt(bar.open) || new Decimal(bar.low).gt(bar.close)) {
    issues.push('OHLC ordering is inconsistent');
  }
  if (bar.volume === null) {
    if (type === InstrumentType.EQUITY) issues.push('Equity volume is required');
  } else if (typeof bar.volume !== 'string' || !/^(?:0|[1-9]\d{0,19})$/.test(bar.volume)) {
    issues.push('Volume must be a nonnegative integer string within NUMERIC(20,0)');
  }
  return issues;
}
