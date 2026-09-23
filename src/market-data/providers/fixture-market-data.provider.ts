import { Injectable } from '@nestjs/common';
import { Exchange } from '../../common/enums/exchange.enum';
import { InstrumentType } from '../../common/enums/instrument-type.enum';
import { ProviderError, ProviderErrorCode } from '../../providers/provider-error';
import { ProviderRequestContext } from '../../providers/provider-request-context';
import { MarketDataProvider } from '../../providers/market-data/market-data-provider.interface';
import {
  AdjustmentBasis,
  CandleInterval,
} from '../../providers/market-data/models/market-data.enums';
import {
  GetInstrumentsRequest,
  HistoricalCandlesRequest,
  LatestPriceRequest,
  TradingCalendar,
  TradingCalendarRequest,
} from '../../providers/market-data/models/market-data-request';
import { ProviderCandle } from '../../providers/market-data/models/provider-candle';
import { ProviderInstrument } from '../../providers/market-data/models/provider-instrument';
import { ProviderLatestPrice } from '../../providers/market-data/models/provider-latest-price';

const DATES = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'];
const CATALOG: readonly ProviderInstrument[] = [
  {
    symbol: 'RELIANCE',
    exchange: Exchange.NSE,
    name: 'Reliance Industries (demo data)',
    instrumentType: InstrumentType.EQUITY,
    sector: null,
    industry: null,
    providerInstrumentId: 'fixture:NSE:RELIANCE',
    providerSymbol: null,
    isIndex: false,
  },
  {
    symbol: 'TCS',
    exchange: Exchange.NSE,
    name: 'Tata Consultancy Services (demo data)',
    instrumentType: InstrumentType.EQUITY,
    sector: null,
    industry: null,
    providerInstrumentId: 'fixture:NSE:TCS',
    providerSymbol: null,
    isIndex: false,
  },
  {
    symbol: 'NIFTY50',
    exchange: Exchange.NSE,
    name: 'Nifty 50 (demo data)',
    instrumentType: InstrumentType.INDEX,
    sector: null,
    industry: null,
    providerInstrumentId: 'fixture:NSE:NIFTY50',
    providerSymbol: null,
    isIndex: true,
  },
];

// Deliberately synthetic, finite fixtures. These are not historical market quotes.
const ROWS: Readonly<Record<string, readonly [string, string, string, string, string | null][]>> = {
  RELIANCE: [
    ['2900', '2940', '2880', '2920', '1000000'],
    ['2920', '2960', '2910', '2950', '1200000'],
    ['2950', '2970', '2920', '2940', '1100000'],
    ['2940', '3000', '2930', '2990', '1500000'],
    ['2990', '3020', '2960', '3010', '1600000'],
  ],
  TCS: [
    ['4000', '4050', '3980', '4030', '500000'],
    ['4030', '4070', '4010', '4060', '600000'],
    ['4060', '4080', '4030', '4040', '550000'],
    ['4040', '4100', '4020', '4090', '700000'],
    ['4090', '4120', '4070', '4100', '800000'],
  ],
  NIFTY50: [
    ['24000', '24200', '23900', '24100', null],
    ['24100', '24300', '24050', '24200', null],
    ['24200', '24250', '24000', '24150', null],
    ['24150', '24400', '24100', '24350', null],
    ['24350', '24500', '24300', '24450', null],
  ],
};

@Injectable()
export class FixtureMarketDataProvider implements MarketDataProvider {
  readonly id = 'fixture-v1';

  readonly isSynthetic = true;

  readonly adjustmentBasis = AdjustmentBasis.UNADJUSTED;

  async getInstruments(
    request: GetInstrumentsRequest = {},
    context: ProviderRequestContext = {},
  ): Promise<readonly ProviderInstrument[]> {
    context.signal?.throwIfAborted();
    return CATALOG.filter(
      (item) => request.exchange === undefined || item.exchange === request.exchange,
    )
      .filter(
        (item) =>
          request.instrumentType === undefined || item.instrumentType === request.instrumentType,
      )
      .map((item) => ({ ...item }));
  }

  async getTradingCalendar(
    request: TradingCalendarRequest,
    context: ProviderRequestContext = {},
  ): Promise<TradingCalendar> {
    context.signal?.throwIfAborted();
    if (request.exchange !== Exchange.NSE) {
      throw this.rejected('Fixture supports NSE only');
    }
    return {
      source: 'fixture-session-calendar-v1',
      isSynthetic: true,
      coverageFrom: '2026-09-07',
      coverageTo: '2026-09-13',
      sessions: DATES.map((date) => ({
        date,
        closeAt: date + 'T10:00:00.000Z',
      })),
    };
  }

  async getHistoricalCandles(
    request: HistoricalCandlesRequest,
    context: ProviderRequestContext = {},
  ): Promise<readonly ProviderCandle[]> {
    context.signal?.throwIfAborted();
    if (request.interval !== CandleInterval.ONE_DAY) {
      throw this.rejected('Fixture supports daily candles only');
    }
    const match = CATALOG.find(
      (item) =>
        item.symbol === request.instrument.symbol &&
        item.exchange === request.instrument.exchange &&
        item.instrumentType === request.instrument.instrumentType &&
        (request.instrument.providerInstrumentId === undefined ||
          item.providerInstrumentId === request.instrument.providerInstrumentId),
    );
    if (!match) throw this.rejected('Instrument is not supported by fixture-v1');
    if (request.from < '2026-09-07' || request.to > '2026-09-13') {
      throw this.rejected('Fixture coverage is 2026-09-07 through 2026-09-13 only');
    }
    return ROWS[match.symbol]
      .map(([open, high, low, close, volume], index): ProviderCandle => ({
        timestamp: DATES[index] + 'T10:00:00.000Z',
        sessionDate: DATES[index],
        open,
        high,
        low,
        close,
        volume,
        adjustedClose: null,
      }))
      .filter((bar) => bar.sessionDate >= request.from && bar.sessionDate <= request.to);
  }

  async getLatestPrice(
    request: LatestPriceRequest,
    context: ProviderRequestContext = {},
  ): Promise<ProviderLatestPrice | null> {
    context.signal?.throwIfAborted();
    const match = CATALOG.find(
      (item) =>
        item.symbol === request.instrument.symbol &&
        item.exchange === request.instrument.exchange &&
        item.instrumentType === request.instrument.instrumentType &&
        (request.instrument.providerInstrumentId === undefined ||
          item.providerInstrumentId === request.instrument.providerInstrumentId),
    );
    if (!match) throw this.rejected('Instrument is not supported by fixture-v1');
    const latest = ROWS[match.symbol].at(-1);
    if (!latest) return null;
    return { price: latest[3], observedAt: DATES.at(-1) + 'T10:00:00.000Z' };
  }

  private rejected(message: string): ProviderError {
    return new ProviderError(message, {
      provider: this.id,
      code: ProviderErrorCode.REQUEST_REJECTED,
      retryable: false,
    });
  }
}
