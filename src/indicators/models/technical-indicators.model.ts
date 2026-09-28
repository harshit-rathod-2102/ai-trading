import { RelativeStrengthResult } from './relative-strength.model';

export interface TechnicalIndicatorSnapshot {
  readonly asOf: string | null;
  readonly close: string | null;
  readonly sma20: string | null;
  readonly sma50: string | null;
  readonly sma200: string | null;
  readonly ema20: string | null;
  readonly ema50: string | null;
  readonly rsi14: string | null;
  readonly atr14: string | null;
  readonly normalizedAtr14: string | null;
  readonly roc20: string | null;
  readonly roc50: string | null;
  readonly rollingHigh20: string | null;
  readonly rollingLow20: string | null;
  readonly rollingHigh50: string | null;
  readonly rollingLow50: string | null;
  readonly distanceFromRollingHigh20Percent: string | null;
  readonly distanceFromRollingLow20Percent: string | null;
  readonly volumeAverage20: string | null;
  readonly volumeRatio20: string | null;
  readonly averageTradedValue20: string | null;
  readonly distanceFromEma20Percent: string | null;
  readonly distanceFromEma50Percent: string | null;
  readonly distanceFromSma200Percent: string | null;
  readonly relativeStrength20: RelativeStrengthResult | null;
  readonly relativeStrength50: RelativeStrengthResult | null;
  readonly relativeStrength126: RelativeStrengthResult | null;
}
