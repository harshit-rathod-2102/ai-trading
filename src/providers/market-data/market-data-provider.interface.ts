import { ProviderRequestContext } from '../provider-request-context';
import {
  GetInstrumentsRequest,
  HistoricalCandlesRequest,
  LatestCandleRequest,
  LatestPriceRequest,
  TradingCalendar,
  TradingCalendarRequest,
} from './models/market-data-request';
import { AdjustmentBasis } from './models/market-data.enums';
import { ProviderCandle } from './models/provider-candle';
import { ProviderInstrument } from './models/provider-instrument';
import { ProviderLatestPrice } from './models/provider-latest-price';

export interface MarketDataProvider {
  readonly id: string;
  readonly isSynthetic: boolean;
  readonly adjustmentBasis: AdjustmentBasis;

  getInstruments(
    request?: GetInstrumentsRequest,
    context?: ProviderRequestContext,
  ): Promise<readonly ProviderInstrument[]>;

  getHistoricalCandles(
    request: HistoricalCandlesRequest,
    context?: ProviderRequestContext,
  ): Promise<readonly ProviderCandle[]>;

  getLatestCandle?(
    request: LatestCandleRequest,
    context?: ProviderRequestContext,
  ): Promise<ProviderCandle | null>;

  getLatestPrice(
    request: LatestPriceRequest,
    context?: ProviderRequestContext,
  ): Promise<ProviderLatestPrice | null>;

  getTradingCalendar(
    request: TradingCalendarRequest,
    context?: ProviderRequestContext,
  ): Promise<TradingCalendar>;
}
