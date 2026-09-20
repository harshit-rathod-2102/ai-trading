import { Exchange } from '../../../common/enums/exchange.enum';
import { InstrumentType } from '../../../common/enums/instrument-type.enum';
import { ProviderInstrumentReference } from './provider-instrument';
import { CandleInterval } from './market-data.enums';

export interface GetInstrumentsRequest {
  readonly exchange?: Exchange;
  readonly instrumentType?: InstrumentType;
  readonly activeOnly?: boolean;
}

export interface HistoricalCandlesRequest {
  readonly instrument: ProviderInstrumentReference;
  readonly interval: CandleInterval;
  /** Inclusive exchange-local session date. */
  readonly from: string;
  /** Inclusive exchange-local session date. */
  readonly to: string;
}

export interface LatestCandleRequest {
  readonly instrument: ProviderInstrumentReference;
  readonly interval: CandleInterval;
}

export interface LatestPriceRequest {
  readonly instrument: ProviderInstrumentReference;
}

export interface TradingCalendarRequest {
  readonly exchange: Exchange;
  readonly from?: string;
  readonly to?: string;
}

export interface TradingSession {
  readonly date: string;
  /** ISO-8601 timestamp for the completed exchange session. */
  readonly closeAt: string;
}

export interface TradingCalendar {
  readonly source: string;
  readonly isSynthetic: boolean;
  readonly coverageFrom: string;
  readonly coverageTo: string;
  readonly sessions: readonly TradingSession[];
}
