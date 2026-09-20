import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Between, DataSource, In, LessThanOrEqual, Repository } from 'typeorm';
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
import { ProviderError } from '../providers/provider-error';
import { elapsedMilliseconds, structuredError } from '../logging/logging.utils';
import { LatestMarketPrice } from './models/latest-market-price.model';

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
      instruments: await this.providerCall('getInstruments', signal =>
        this.provider.getInstruments(undefined, { signal })),
      calendar: await this.calendar('NSE'),
    };
  }

  async tradingCalendar(exchange: Exchange, from: string, to: string): Promise<TradingCalendar> {
    assertRange(from, to);
    return this.calendar(exchange, from, to);
  }

  async latestPrice(instrumentId: string): Promise<LatestMarketPrice> {
    const instrument = await this.instruments.get(instrumentId);
    const quote = await this.providerCall('getLatestPrice', signal =>
      this.provider.getLatestPrice({
        instrument: {
          symbol: instrument.symbol,
          exchange: instrument.exchange as Exchange,
          instrumentType: instrument.type,
          providerInstrumentId: instrument.providerInstrumentId ?? undefined,
        },
      }, { signal }), { instrumentId, symbol: instrument.symbol });
    if (!quote) throw new BadGatewayException('Market-data provider returned no latest price');
    const price = new Decimal(quote.price);
    const observedAt = new Date(quote.observedAt);
    if (!price.isFinite() || price.lte(0) || Number.isNaN(observedAt.getTime())) {
      throw new BadGatewayException('Market-data provider returned an invalid latest price');
    }
    return {
      instrumentId,
      symbol: instrument.symbol,
      price: price.toDecimalPlaces(4).toFixed(4),
      observedAt: observedAt.toISOString(),
      provider: this.provider.id,
      isSynthetic: this.provider.isSynthetic,
    };
  }

  async syncInstruments() {
    const startedAt = performance.now();
    this.logger.log({ event: 'market_data.sync.started', module: MarketDataService.name,
      operation: 'syncInstruments', provider: this.provider.id }, 'Instrument sync started');
    try {
      const catalog = await this.providerCall('getInstruments', signal => this.provider.getInstruments({
        exchange: Exchange.NSE,
        activeOnly: true,
      }, { signal }));
      const result = await this.instruments.syncProviderCatalog(this.provider.id, catalog);
      this.logger.log({ event: 'market_data.sync.completed', module: MarketDataService.name,
        operation: 'syncInstruments', provider: this.provider.id, receivedCount: catalog.length,
        writtenCount: result.upserted,
        durationMs: elapsedMilliseconds(startedAt), status: 'completed' }, 'Instrument sync completed');
      return result;
    } catch (error: unknown) {
      this.logger.error({ event: 'market_data.sync.failed', module: MarketDataService.name,
        operation: 'syncInstruments', provider: this.provider.id,
        durationMs: elapsedMilliseconds(startedAt), ...structuredError(error) }, 'Instrument sync failed');
      throw error;
    }
  }

  async list(instrumentId: string, from: string, to: string): Promise<DailyCandle[]> {
    assertRange(from, to);
    await this.instruments.get(instrumentId);
    return this.candles.find({
      where: { instrumentId, sessionDate: Between(from, to) },
      order: { sessionDate: 'ASC' },
    });
  }

  async listMany(instrumentIds: readonly string[], from: string, to: string): Promise<DailyCandle[]> {
    assertRange(from, to);
    const ids = [...new Set(instrumentIds)];
    if (!ids.length) return [];
    return this.candles.find({
      where: { instrumentId: In(ids), sessionDate: Between(from, to) },
      order: { instrumentId: 'ASC', sessionDate: 'ASC' },
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
    const startedAt = performance.now();
    this.logger.log({ event: 'market_data.sync.started', module: MarketDataService.name,
      operation: 'refreshDailyCandles', provider: this.provider.id, instrumentId,
      interval: CandleInterval.ONE_DAY, from, to }, 'Candle sync started');
    let symbol: string | undefined;
    try {
    // Serialize provider reads and writes for the same instrument. This avoids an
    // older concurrent response overwriting a newer refresh. Calls are time bounded.
    const result = await this.dataSource.transaction(async manager => {
      const instrument = await manager.getRepository(Instrument).findOne({
        where: { id: instrumentId }, lock: { mode: 'pessimistic_write' },
      });
      if (!instrument) throw new BadRequestException('Instrument no longer exists');
      if (!instrument.isActive) throw new ConflictException('Inactive instruments cannot be refreshed');
      symbol = instrument.symbol;

      const calendar = await this.calendar(instrument.exchange, from, to);
      if (from < calendar.coverageFrom || to > calendar.coverageTo) {
        throw new BadRequestException('Provider calendar does not cover the complete requested range');
      }
      const bars = await this.providerCall('getHistoricalCandles', signal => this.provider.getHistoricalCandles({
        instrument: {
          symbol: instrument.symbol,
          exchange: instrument.exchange as Exchange,
          instrumentType: instrument.type,
          providerInstrumentId: instrument.providerInstrumentId ?? undefined,
        },
        interval: CandleInterval.ONE_DAY,
        from,
        to,
      }, { signal }), { symbol: instrument.symbol, instrumentId, from, to,
        interval: CandleInterval.ONE_DAY });
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
        this.logger.warn({ event: 'market_data.quality.failed', module: MarketDataService.name,
          operation: 'refreshDailyCandles', provider: this.provider.id, symbol: instrument.symbol,
          instrumentId, rejectedCount: issues.length, missingSessionCount: missing.length,
          durationMs: elapsedMilliseconds(startedAt) }, 'Candle data failed validation');
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
    this.logger.log({ event: 'market_data.sync.completed', module: MarketDataService.name,
      operation: 'refreshDailyCandles', provider: this.provider.id, instrumentId,
      symbol, interval: CandleInterval.ONE_DAY, from, to, receivedCount: result.upserted,
      writtenCount: result.upserted, rejectedCount: 0,
      durationMs: elapsedMilliseconds(startedAt), status: 'completed' }, 'Candle sync completed');
    return result;
    } catch (error: unknown) {
      this.logger.error({ event: 'market_data.sync.failed', module: MarketDataService.name,
        operation: 'refreshDailyCandles', provider: this.provider.id, instrumentId, symbol,
        interval: CandleInterval.ONE_DAY, from, to, durationMs: elapsedMilliseconds(startedAt),
        ...structuredError(error) }, 'Candle sync failed');
      throw error;
    }
  }

  private async calendar(exchange: string, from?: string, to?: string): Promise<TradingCalendar> {
    const calendar = await this.providerCall('getTradingCalendar', signal => this.provider.getTradingCalendar({
      exchange: exchange as Exchange,
      from,
      to,
    }, { signal }), { exchange, from, to });
    const issues = calendarIssues(calendar);
    if (issues.length) throw new BadGatewayException({ message: 'Invalid provider calendar', issues });
    return calendar;
  }

  private async providerCall<T>(
    operation: string,
    call: (signal: AbortSignal) => Promise<T>,
    metadata: Readonly<Record<string, unknown>> = {},
  ): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = performance.now();
    this.logger.debug({ event: 'provider.request.started', module: MarketDataService.name,
      provider: this.provider.id, operation, ...metadata }, 'Provider request started');
    try {
      const result = await Promise.race([
        call(controller.signal),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new BadGatewayException('Market-data provider timed out'));
          }, 15000);
        }),
      ]);
      this.logger.debug({ event: 'provider.request.completed', module: MarketDataService.name,
        provider: this.provider.id, operation, ...metadata, status: 'completed',
        resultCount: Array.isArray(result) ? result.length : undefined,
        durationMs: elapsedMilliseconds(startedAt) }, 'Provider request completed');
      return result;
    } catch (error: unknown) {
      this.logger.error({ event: 'provider.request.failed', module: MarketDataService.name,
        provider: this.provider.id, operation, ...metadata, status: 'failed',
        providerErrorCode: error instanceof ProviderError ? error.code : undefined,
        retryable: error instanceof ProviderError ? error.retryable : undefined,
        durationMs: elapsedMilliseconds(startedAt), ...structuredError(error) }, 'Provider request failed');
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
