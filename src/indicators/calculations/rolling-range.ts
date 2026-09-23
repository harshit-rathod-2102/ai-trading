import { IndicatorCandle } from '../models/indicator-candle.model';
import { formatIndicator, periodIsValid, positiveDecimal } from './decimal';

function rollingExtreme(
  candles: readonly IndicatorCandle[],
  period: number,
  field: 'high' | 'low',
): string | null {
  periodIsValid(period);
  const values = candles.map((candle, index) =>
    positiveDecimal(candle[field], `candles[${index}].${field}`),
  );
  if (values.length < period) return null;
  return formatIndicator(
    values
      .slice(-period)
      .reduce((result, value) =>
        field === 'high' ? (value.gt(result) ? value : result) : value.lt(result) ? value : result,
      ),
  );
}

export const calculateRollingHigh = (
  candles: readonly IndicatorCandle[],
  period: number,
): string | null => rollingExtreme(candles, period, 'high');
export const calculateRollingLow = (
  candles: readonly IndicatorCandle[],
  period: number,
): string | null => rollingExtreme(candles, period, 'low');
