import Decimal from 'decimal.js';
import { IndicatorCandle } from '../models/indicator-candle.model';
import {
  formatIndicator,
  mean,
  nonNegativeDecimal,
  periodIsValid,
  positiveDecimal,
} from './decimal';

function volumes(candles: readonly IndicatorCandle[]): (Decimal | null)[] {
  return candles.map((candle, index) =>
    candle.volume === null ? null : nonNegativeDecimal(candle.volume, `candles[${index}].volume`),
  );
}

export function calculateAverageVolume(
  candles: readonly IndicatorCandle[],
  period: number,
): string | null {
  periodIsValid(period);
  const parsed = volumes(candles);
  if (parsed.length < period) return null;
  const window = parsed.slice(-period);
  if (window.some((value) => value === null)) return null;
  return formatIndicator(mean(window as Decimal[]));
}

// The current candle is excluded from the prior-period anomaly baseline.
export function calculateVolumeRatio(
  candles: readonly IndicatorCandle[],
  period: number,
): string | null {
  periodIsValid(period);
  const parsed = volumes(candles);
  if (parsed.length < period + 1 || parsed.at(-1) === null) return null;
  const baseline = parsed.slice(-(period + 1), -1);
  if (baseline.some((value) => value === null)) return null;
  const average = mean(baseline as Decimal[]);
  if (average.isZero()) return null;
  return formatIndicator(parsed.at(-1)!.div(average));
}

export function calculateAverageTradedValue(
  candles: readonly IndicatorCandle[],
  period: number,
): string | null {
  periodIsValid(period);
  if (candles.length < period) return null;
  const values = candles.slice(-period).map((candle, index) => {
    if (candle.volume === null) return null;
    return positiveDecimal(candle.close, `window[${index}].close`).times(
      nonNegativeDecimal(candle.volume, `window[${index}].volume`),
    );
  });
  if (values.some((value) => value === null)) return null;
  return formatIndicator(mean(values as Decimal[]));
}
