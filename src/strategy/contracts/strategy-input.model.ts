import { IndicatorCandle } from '../../indicators/models/indicator-candle.model';
import { TechnicalIndicatorSnapshot } from '../../indicators/models/technical-indicators.model';
import { MarketRegimeResult } from '../../market-regime/models/market-regime-result.model';

export interface SectorContext {
  readonly sector: string;
  /** Supplied deterministic sector score, 0..100; no inference from sector name. */
  readonly strengthScore: string;
  readonly asOf: string;
}

export interface StrategyInput {
  readonly instrument: { readonly symbol: string; readonly exchange: string; readonly sector?: string | null };
  /** Finalized daily observations, oldest first. Timestamp represents the session date in UTC. */
  readonly candles: readonly IndicatorCandle[];
  readonly indicators: TechnicalIndicatorSnapshot;
  readonly marketRegime: MarketRegimeResult;
  readonly sectorContext?: SectorContext;
  /** Supplied by caller; no wall clock is read by evaluation. */
  readonly evaluatedAt: Date;
}
