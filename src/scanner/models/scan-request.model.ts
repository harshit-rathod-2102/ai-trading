import { Instrument } from '../../instruments/entities/instrument.entity';
import { IndicatorCandle } from '../../indicators/models/indicator-candle.model';
import { MarketRegimeResult } from '../../market-regime/models/market-regime-result.model';

export interface ScanInstrumentInput {
  readonly instrument: Instrument;
  readonly candles: readonly IndicatorCandle[];
}

export interface UniverseEvaluationInput {
  readonly instruments: readonly ScanInstrumentInput[];
  readonly benchmarkCandles: readonly IndicatorCandle[];
  readonly marketRegime: MarketRegimeResult;
  readonly evaluatedAt: Date;
}
