import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Between, DataSource, LessThanOrEqual, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { Instrument } from '../instruments/entities/instrument.entity';
import { InstrumentsService } from '../instruments/instruments.service';
import { Exchange } from '../common/enums/exchange.enum';
import { DailyCandle } from './entities/daily-candle.entity';
import { MARKET_DATA_PROVIDER } from '../providers/market-data/market-data-provider.token';
import { MarketDataProvider } from '../providers/market-data/market-data-provider.interface';
import { CandleInterval } from '../providers/market-data/models/market-data.enums';
import { TradingCalendar } from '../providers/market-data/models/market-data-request';
import { assertRange, barIssues, calendarIssues, expectedSessions, marketDate } from './market-data.validation';
import { DataQualityService } from './data-quality.service';

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  constructor(
    @Inject(MARKET_DATA_PROVIDER) private readonly provider: MarketDataProvider,
    @InjectRepository(DailyCandle) private readonly candles: Repository<DailyCandle>,
    private readonly instruments: InstrumentsService,
    private readonly dataSource: DataSource,
    private readonly qualityService: DataQualityService,
  ) {}

  async providerInfo() {
    return {
      id: this.provider.id, isSynthetic: this.provider.isSynthetic,
      adjustmentBasis: this.provider.adjustmentBasis,
      instruments: await this.providerCall(signal =>
        this.provider.getInstruments(undefined, { signal })),
      calendar: await this.calendar('NSE'),
    };
  }

  async syncInstruments() {
    const catalog = await this.providerCall(signal => this.provider.getInstruments({
      exchange: Exchange.NSE,
      activeOnly: true,
    }, { signal }));
    const result = await this.instruments.syncProviderCatalog(this.provider.id, catalog);
    this.logger.log(`Instrument catalog synchronized from ${this.provider.id}: ${result.upserted} records`);
    return result;
  }

  async list(instrumentId: string, from: string, to: string): Promise<DailyCandle[]> {
    assertRange(from, to);
    await this.instruments.get(instrumentId);
    return this.candles.find({
      where: { instrumentId, sessionDate: Between(from, to) },
      order: { sessionDate: 'ASC' },
    });
  }

  async quality(instrumentId: string, from: string, to: string) {
    assertRange(from, to);
    const instrument = await this.instruments.get(instrumentId);
    const [rows, latest, calendar] = await Promise.all([
      this.list(instrumentId, from, to),
      this.candles.findOne({
        where: { instrumentId, sessionDate: LessThanOrEqual(marketDate()) },
        order: { sessionDate: 'DESC' },
      }),
      this.calendar(instrument.exchange, from, to),
    ]);
    return this.qualityService.assess(instrument, rows, latest, calendar, from, to);
  }

  async refresh(instrumentId: string, from: string, to: string) {
    assertRange(from, to);
    // Serialize provider reads and writes for the same instrument. This avoids an
    // older concurrent response overwriting a newer refresh. Calls are time bounded.
    const result = await this.dataSource.transaction(async manager => {
      const instrument = await manager.getRepository(Instrument).findOne({
        where: { id: instrumentId }, lock: { mode: 'pessimistic_write' },
      });
      if (!instrument) throw new BadRequestException('Instrument no longer exists');
      if (!instrument.isActive) throw new ConflictException('Inactive instruments cannot be refreshed');

      const calendar = await this.calendar(instrument.exchange, from, to);
      if (from < calendar.coverageFrom || to > calendar.coverageTo) {
        throw new BadRequestException('Provider calendar does not cover the complete requested range');
      }
      const bars = await this.providerCall(signal => this.provider.getHistoricalCandles({
        instrument: {
          symbol: instrument.symbol,
          exchange: instrument.exchange as Exchange,
          instrumentType: instrument.type,
          providerInstrumentId: instrument.providerInstrumentId ?? undefined,
        },
        interval: CandleInterval.ONE_DAY,
        from,
        to,
      }, { signal }));
      if (!Array.isArray(bars)) throw new BadGatewayException('Provider did not return daily candles');
      const now = new Date();
      const expected = expectedSessions(calendar, from, to, now);
      const expectedSet = new Set(expected);
      const seen = new Set<string>();
      const issues: { sessionDate: string | null; issues: string[] }[] = [];
      for (const bar of bars) {
        const errors = barIssues(bar, instrument.type);
        if (!bar || !expectedSet.has(bar.sessionDate)) errors.push('Date is outside requested completed sessions');
        if (bar && seen.has(bar.sessionDate)) errors.push('Provider returned a duplicate session');
        if (bar) seen.add(bar.sessionDate);
        if (errors.length) issues.push({ sessionDate: bar?.sessionDate ?? null, issues: errors });
      }
      const missing = expected.filter(date => !seen.has(date));
      if (issues.length || missing.length) {
        this.logger.warn(`Refresh rejected for ${instrumentId}: ${issues.length} invalid rows, ${missing.length} missing sessions`);
        throw new BadGatewayException({
          message: 'Provider data failed validation; no candles were written',
          issues, missingSessions: missing,
        });
      }
      const repository = manager.getRepository(DailyCandle);
      const incompatible = await repository.createQueryBuilder('candle')
        .where('candle.instrumentId = :instrumentId', { instrumentId })
        .andWhere('(candle.isSynthetic <> :synthetic OR candle.adjustmentBasis <> :basis)',
          { synthetic: this.provider.isSynthetic, basis: this.provider.adjustmentBasis }).getExists();
      if (incompatible) throw new ConflictException('Cannot mix synthetic/live data or adjustment bases; deliberate history replacement is required');

      if (bars.length) {
        const values = bars.map(bar => repository.create({
          id: randomUUID(), instrumentId, sessionDate: bar.sessionDate,
          open: new Decimal(bar.open).toFixed(4), high: new Decimal(bar.high).toFixed(4),
          low: new Decimal(bar.low).toFixed(4), close: new Decimal(bar.close).toFixed(4),
          volume: bar.volume, provider: this.provider.id, isSynthetic: this.provider.isSynthetic,
          adjustmentBasis: this.provider.adjustmentBasis, fetchedAt: now, updatedAt: now,
        }));
        await repository.createQueryBuilder().insert().values(values).orUpdate([
          'open', 'high', 'low', 'close', 'volume', 'provider', 'is_synthetic',
          'adjustment_basis', 'fetched_at', 'updated_at',
        ], ['instrument_id', 'session_date']).execute();
      }
      return { instrumentId, from, to, upserted: bars.length, provider: this.provider.id,
        isSynthetic: this.provider.isSynthetic, adjustmentBasis: this.provider.adjustmentBasis };
    });
    this.logger.log(`Daily candles refreshed: ${instrumentId}, ${result.upserted} sessions (${from} to ${to})`);
    return result;
  }

  private async calendar(exchange: string, from?: string, to?: string): Promise<TradingCalendar> {
    const calendar = await this.providerCall(signal => this.provider.getTradingCalendar({
      exchange: exchange as Exchange,
      from,
      to,
    }, { signal }));
    const issues = calendarIssues(calendar);
    if (issues.length) throw new BadGatewayException({ message: 'Invalid provider calendar', issues });
    return calendar;
  }

  private async providerCall<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(controller.signal),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new BadGatewayException('Market-data provider timed out'));
          }, 15000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
