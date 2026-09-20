import { Injectable, Logger } from '@nestjs/common';
import { Exchange } from '../../../common/enums/exchange.enum';
import { InstrumentType } from '../../../common/enums/instrument-type.enum';
import { MarketDataProvider } from '../market-data-provider.interface';
import { AdjustmentBasis, CandleInterval } from '../models/market-data.enums';
import {
  GetInstrumentsRequest,
  HistoricalCandlesRequest,
  LatestCandleRequest,
  LatestPriceRequest,
  TradingCalendar,
  TradingCalendarRequest,
} from '../models/market-data-request';
import { ProviderCandle } from '../models/provider-candle';
import { ProviderInstrument, ProviderInstrumentReference } from '../models/provider-instrument';
import { ProviderError, ProviderErrorCode } from '../../provider-error';
import { ProviderRequestContext } from '../../provider-request-context';
import { UpstoxHistoricalResponse } from './dto/upstox-historical-response';
import { UpstoxInstrumentRecord } from './dto/upstox-instrument';
import { UpstoxQuote, UpstoxQuoteResponse } from './dto/upstox-quote-response';
import { mapUpstoxCandle, mapUpstoxQuoteCandle } from './mappers/upstox-candle.mapper';
import { mapUpstoxInstrument } from './mappers/upstox-instrument.mapper';
import { UpstoxClient } from './upstox-client';
import { elapsedMilliseconds } from '../../../logging/logging.utils';
import { ProviderLatestPrice } from '../models/provider-latest-price';
import { UpstoxLatestPriceQuote, UpstoxLatestPriceResponse } from './dto/upstox-latest-price-response';
import { mapUpstoxLatestPrice } from './mappers/upstox-latest-price.mapper';

const NIFTY_50_KEY = 'NSE_INDEX|Nifty 50';
const INSTRUMENT_CACHE_MS = 15 * 60 * 1000;

@Injectable()
export class UpstoxMarketDataProvider implements MarketDataProvider {
  readonly id = 'upstox';
  readonly isSynthetic = false;
  readonly adjustmentBasis = AdjustmentBasis.UNADJUSTED;
  private readonly logger = new Logger(UpstoxMarketDataProvider.name);
  private instrumentCache?: { readonly loadedAt: number; readonly instruments: readonly ProviderInstrument[] };

  constructor(private readonly client: UpstoxClient) {}

  async getInstruments(
    request: GetInstrumentsRequest = {},
    context?: ProviderRequestContext,
  ): Promise<readonly ProviderInstrument[]> {
    const startedAt = performance.now();
    this.logger.debug({ event: 'provider.request.started', module: UpstoxMarketDataProvider.name,
      provider: this.id, operation: 'getInstruments', endpoint: 'instrument-master' },
    'Upstox instrument request started');
    const instruments = await this.loadInstrumentCatalog(context);
    const filtered = instruments.filter(instrument =>
      (!request.exchange || instrument.exchange === request.exchange) &&
      (!request.instrumentType || instrument.instrumentType === request.instrumentType));
    this.logger.debug({ event: 'provider.request.completed', module: UpstoxMarketDataProvider.name,
      provider: this.id, operation: 'getInstruments', endpoint: 'instrument-master',
      resultCount: filtered.length, durationMs: elapsedMilliseconds(startedAt),
      status: 'completed' }, 'Upstox instrument request completed');
    return filtered;
  }

  async getHistoricalCandles(
    request: HistoricalCandlesRequest,
    context?: ProviderRequestContext,
  ): Promise<readonly ProviderCandle[]> {
    this.assertDaily(request.interval);
    const startedAt = performance.now();
    const instrumentKey = await this.resolveInstrumentKey(request.instrument, context);
    const windows = splitDailyRange(request.from, request.to);
    this.logger.debug({ event: 'provider.request.started', module: UpstoxMarketDataProvider.name,
      provider: this.id, operation: 'getHistoricalCandles', symbol: request.instrument.symbol,
      from: request.from, to: request.to, windowCount: windows.length },
    'Upstox historical candle request started');
    const candles = new Map<string, ProviderCandle>();
    for (const window of windows) {
      const rows = await this.fetchHistoricalWindow(instrumentKey, window.from, window.to, context);
      this.logger.debug({ event: 'provider.request.chunk.completed', module: UpstoxMarketDataProvider.name,
        provider: this.id, operation: 'getHistoricalCandles', symbol: request.instrument.symbol,
        from: window.from, to: window.to, resultCount: rows.length },
      'Upstox historical candle chunk completed');
      for (const candle of rows) candles.set(candle.sessionDate, candle);
    }
    const result = [...candles.values()].sort((left, right) => left.sessionDate.localeCompare(right.sessionDate));
    this.logger.debug({ event: 'provider.request.completed', module: UpstoxMarketDataProvider.name,
      provider: this.id, operation: 'getHistoricalCandles', symbol: request.instrument.symbol,
      from: request.from, to: request.to, resultCount: result.length,
      durationMs: elapsedMilliseconds(startedAt), status: 'completed' },
    'Upstox historical candle request completed');
    return result;
  }

  async getLatestCandle(
    request: LatestCandleRequest,
    context?: ProviderRequestContext,
  ): Promise<ProviderCandle | null> {
    this.assertDaily(request.interval);
    const startedAt = performance.now();
    const instrumentKey = await this.resolveInstrumentKey(request.instrument, context);
    this.logger.debug({ event: 'provider.request.started', module: UpstoxMarketDataProvider.name,
      provider: this.id, operation: 'getLatestCandle', symbol: request.instrument.symbol },
    'Upstox latest candle request started');
    const response = await this.client.getJson<UpstoxQuoteResponse>(
      `/v3/market-quote/ohlc?instrument_key=${encodeURIComponent(instrumentKey)}&interval=1d`,
      context,
    );
    if (response.status !== 'success' || !isRecord(response.data)) {
      throw this.invalidResponse('Upstox quote response is missing data');
    }
    const quote = Object.values(response.data).find(value =>
      isRecord(value) && value.instrument_token === instrumentKey) ?? Object.values(response.data)[0];
    if (!isRecord(quote)) return null;
    const typedQuote = quote as UpstoxQuote;
    if (!typedQuote.live_ohlc || !isRecord(typedQuote.live_ohlc)) {
      throw this.invalidResponse('Upstox quote response is missing daily OHLC');
    }
    const result = mapUpstoxQuoteCandle(typedQuote.live_ohlc);
    this.logger.debug({ event: 'provider.request.completed', module: UpstoxMarketDataProvider.name,
      provider: this.id, operation: 'getLatestCandle', symbol: request.instrument.symbol,
      resultCount: 1, durationMs: elapsedMilliseconds(startedAt), status: 'completed' },
    'Upstox latest candle request completed');
    return result;
  }

  async getLatestPrice(
    request: LatestPriceRequest,
    context?: ProviderRequestContext,
  ): Promise<ProviderLatestPrice | null> {
    const startedAt = performance.now();
    const instrumentKey = await this.resolveInstrumentKey(request.instrument, context);
    this.logger.debug({ event: 'provider.request.started', module: UpstoxMarketDataProvider.name,
      provider: this.id, operation: 'getLatestPrice', symbol: request.instrument.symbol },
    'Upstox latest-price request started');
    const response = await this.client.getJson<UpstoxLatestPriceResponse>(
      `/v3/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKey)}`,
      context,
    );
    if (response.status !== 'success' || !isRecord(response.data)) {
      throw this.invalidResponse('Upstox latest-price response is missing data');
    }
    const quote = Object.values(response.data).find(value =>
      isRecord(value) && value.instrument_token === instrumentKey) ?? Object.values(response.data)[0];
    if (!isRecord(quote)) return null;
    const result = mapUpstoxLatestPrice(quote as UpstoxLatestPriceQuote);
    this.logger.debug({ event: 'provider.request.completed', module: UpstoxMarketDataProvider.name,
      provider: this.id, operation: 'getLatestPrice', symbol: request.instrument.symbol,
      observedAt: result.observedAt, durationMs: elapsedMilliseconds(startedAt), status: 'completed' },
    'Upstox latest-price request completed');
    return result;
  }

  async getTradingCalendar(
    request: TradingCalendarRequest,
    context?: ProviderRequestContext,
  ): Promise<TradingCalendar> {
    if (request.exchange !== Exchange.NSE) {
      throw new ProviderError('Upstox V1 calendar supports NSE only', {
        provider: this.id, code: ProviderErrorCode.REQUEST_REJECTED, retryable: false,
      });
    }
    const today = marketDate(new Date());
    const from = request.from ?? `${today.slice(0, 4)}-01-01`;
    const to = request.to ?? today;
    const windows = splitDailyRange(from, to);
    const candles = new Map<string, ProviderCandle>();
    for (const window of windows) {
      for (const candle of await this.fetchHistoricalWindow(NIFTY_50_KEY, window.from, window.to, context)) {
        candles.set(candle.sessionDate, candle);
      }
    }
    const sessions = [...candles.keys()].sort().map(date => ({
      date,
      closeAt: new Date(`${date}T15:30:00+05:30`).toISOString(),
    }));
    return { source: this.id, isSynthetic: false, coverageFrom: from, coverageTo: to, sessions };
  }

  private async loadInstrumentCatalog(context?: ProviderRequestContext): Promise<readonly ProviderInstrument[]> {
    if (this.instrumentCache && Date.now() - this.instrumentCache.loadedAt < INSTRUMENT_CACHE_MS) {
      return this.instrumentCache.instruments;
    }
    const payload = await this.client.getInstrumentFile<unknown>(context);
    if (!Array.isArray(payload)) throw this.invalidResponse('Upstox instrument file is not an array');
    const instruments = payload.map(record => {
      if (!isRecord(record)) return null;
      return mapUpstoxInstrument(record as UpstoxInstrumentRecord);
    }).filter((instrument): instrument is ProviderInstrument => instrument !== null);
    this.instrumentCache = { loadedAt: Date.now(), instruments };
    return instruments;
  }

  private async resolveInstrumentKey(
    reference: ProviderInstrumentReference,
    context?: ProviderRequestContext,
  ): Promise<string> {
    if (reference.providerInstrumentId) return reference.providerInstrumentId;
    const instruments = await this.getInstruments({
      exchange: reference.exchange, instrumentType: reference.instrumentType,
    }, context);
    const match = instruments.find(item => item.symbol === reference.symbol.toUpperCase());
    if (!match) {
      throw new ProviderError(`Upstox instrument mapping was not found for ${reference.exchange}:${reference.symbol}`, {
        provider: this.id, code: ProviderErrorCode.REQUEST_REJECTED, retryable: false,
      });
    }
    return match.providerInstrumentId;
  }

  private async fetchHistoricalWindow(
    instrumentKey: string,
    from: string,
    to: string,
    context?: ProviderRequestContext,
  ): Promise<readonly ProviderCandle[]> {
    const response = await this.client.getJson<UpstoxHistoricalResponse>(
      `/v3/historical-candle/${encodeURIComponent(instrumentKey)}/days/1/${to}/${from}`,
      context,
    );
    if (response.status !== 'success' || !response.data || !Array.isArray(response.data.candles)) {
      throw this.invalidResponse('Upstox historical response is missing candles');
    }
    return response.data.candles.map(value => {
      if (!Array.isArray(value)) throw this.invalidResponse('Upstox historical candle is not an array');
      return mapUpstoxCandle(value);
    });
  }

  private assertDaily(interval: CandleInterval): void {
    if (interval !== CandleInterval.ONE_DAY) {
      throw new ProviderError('Upstox V1 supports daily candles only', {
        provider: this.id, code: ProviderErrorCode.REQUEST_REJECTED, retryable: false,
      });
    }
  }

  private invalidResponse(message: string): ProviderError {
    return new ProviderError(message, {
      provider: this.id, code: ProviderErrorCode.INVALID_RESPONSE, retryable: false,
    });
  }
}

export function splitDailyRange(from: string, to: string): readonly { from: string; to: string }[] {
  const start = parseDate(from);
  const end = parseDate(to);
  if (start > end) throw new ProviderError('Historical range start must not exceed end', {
    provider: 'upstox', code: ProviderErrorCode.REQUEST_REJECTED, retryable: false,
  });
  const windows: { from: string; to: string }[] = [];
  let cursor = start;
  while (cursor <= end) {
    const exclusiveLimit = new Date(Date.UTC(cursor.getUTCFullYear() + 10, cursor.getUTCMonth(), cursor.getUTCDate()));
    const windowEnd = new Date(Math.min(end.getTime(), exclusiveLimit.getTime() - 86_400_000));
    windows.push({ from: isoDate(cursor), to: isoDate(windowEnd) });
    cursor = new Date(windowEnd.getTime() + 86_400_000);
  }
  return windows;
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalidDate();
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || isoDate(date) !== value) throw invalidDate();
  return date;
}

function invalidDate(): ProviderError {
  return new ProviderError('Upstox historical dates must be valid YYYY-MM-DD values', {
    provider: 'upstox', code: ProviderErrorCode.REQUEST_REJECTED, retryable: false,
  });
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function marketDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
