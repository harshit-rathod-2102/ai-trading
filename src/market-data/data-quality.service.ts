import { Injectable } from '@nestjs/common';
import { Instrument } from '../instruments/entities/instrument.entity';
import { InstrumentType } from '../common/enums/instrument-type.enum';
import { DailyCandle } from './entities/daily-candle.entity';
import { TradingCalendar } from '../providers/market-data/models/market-data-request';
import { barIssues, expectedSessions, marketDate } from './market-data.validation';

@Injectable()
export class DataQualityService {
  assess(instrument: Instrument, rows: DailyCandle[], latest: DailyCandle | null,
    calendar: TradingCalendar, from: string, to: string, now = new Date()) {
    const covered = from >= calendar.coverageFrom && to <= calendar.coverageTo;
    const expected = expectedSessions(calendar, from, to, now);
    const dates = new Set(rows.map(row => row.sessionDate));
    const missingSessions = expected.filter(date => !dates.has(date));
    const calendarDates = new Map(calendar.sessions.map(session => [session.date, session]));
    const invalidRows: { sessionDate: string; issues: string[] }[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const issues = barIssues(row, instrument.type);
      if (seen.has(row.sessionDate)) issues.push('Duplicate session');
      seen.add(row.sessionDate);
      if (row.sessionDate >= calendar.coverageFrom && row.sessionDate <= calendar.coverageTo) {
        const session = calendarDates.get(row.sessionDate);
        if (!session) issues.push('Candle on a non-session date');
        else if (Date.parse(session.closeAt) > now.getTime()) issues.push('Session is not yet closed');
      }
      if (row.sessionDate > marketDate(now)) issues.push('Future session');
      if (issues.length) invalidRows.push({ sessionDate: row.sessionDate, issues });
    }
    const today = marketDate(now);
    const currentCalendarKnown = today >= calendar.coverageFrom && today <= calendar.coverageTo;
    const completed = expectedSessions(calendar, calendar.coverageFrom, today, now);
    const latestExpectedSession = currentCalendarKnown ? completed.at(-1) ?? null : null;
    const freshness = !latestExpectedSession ? 'UNKNOWN' :
      latest?.sessionDate === latestExpectedSession ? 'CURRENT' : 'STALE';
    const zeroVolumeSessions = instrument.type === InstrumentType.EQUITY ?
      rows.filter(row => row.volume === '0').map(row => row.sessionDate) : [];
    const synthetic = rows.some(row => row.isSynthetic) || Boolean(latest?.isSynthetic) || calendar.isSynthetic;
    const unknownSessionDates = rows.filter(row => row.sessionDate < calendar.coverageFrom ||
      row.sessionDate > calendar.coverageTo).map(row => row.sessionDate);
    const adjustmentBases = [...new Set(rows.map(row => row.adjustmentBasis))];
    const warnings: string[] = [];
    if (synthetic) warnings.push('SYNTHETIC_DATA_OR_CALENDAR');
    if (!covered) warnings.push('CALENDAR_COVERAGE_INCOMPLETE');
    if (!currentCalendarKnown || !latestExpectedSession) warnings.push('CURRENT_SESSION_UNKNOWN');
    if (zeroVolumeSessions.length) warnings.push('ZERO_EQUITY_VOLUME');
    if (adjustmentBases.includes('UNADJUSTED')) warnings.push('CORPORATE_ACTION_ADJUSTMENT_NOT_VERIFIED');
    if (adjustmentBases.length > 1) warnings.push('MIXED_ADJUSTMENT_BASIS');
    if (!instrument.isActive) warnings.push('INSTRUMENT_INACTIVE');
    const completeness = !covered ? 'UNKNOWN' : missingSessions.length ? 'MISSING' : 'COMPLETE';
    return {
      instrumentId: instrument.id, symbol: instrument.symbol, instrumentType: instrument.type,
      range: { from, to }, assessedAt: now.toISOString(), marketTimezone: 'Asia/Kolkata',
      calendar: { source: calendar.source, isSynthetic: calendar.isSynthetic,
        coverageFrom: calendar.coverageFrom, coverageTo: calendar.coverageTo },
      storedCount: rows.length, expectedCount: covered ? expected.length : null,
      firstStoredSession: rows[0]?.sessionDate ?? null,
      lastStoredSession: rows.at(-1)?.sessionDate ?? null,
      latestStoredSession: latest?.sessionDate ?? null, latestExpectedSession,
      lastFetchedAt: latest?.fetchedAt ?? null,
      freshness, completeness, missingSessions, invalidRows, unknownSessionDates, zeroVolumeSessions,
      validity: invalidRows.length ? 'INVALID' : rows.length ? 'VALID' : 'NO_DATA',
      providers: [...new Set(rows.map(row => row.provider))], adjustmentBases,
      isSynthetic: synthetic, warnings,
      // This reports structural availability, not suitability for a trading strategy.
      dataAvailable: rows.length > 0 && completeness === 'COMPLETE' && !invalidRows.length,
      readyForStrategy: false,
    };
  }
}
