import Decimal from 'decimal.js';
import { IndicatorCandle } from '../models/indicator-candle.model';
import { IndicatorDecimal, formatIndicator, mean, periodIsValid, positiveDecimal } from './decimal';

export function calculateAtr(candles: readonly IndicatorCandle[], period = 14): string | null {
  periodIsValid(period);
  if (candles.length === 0) return null;
  const ranges = candles.map((candle, index) => {
    const high = positiveDecimal(candle.high, `candles[${index}].high`);
    const low = positiveDecimal(candle.low, `candles[${index}].low`);
    if (high.lt(low)) throw new RangeError(`candles[${index}] high must be at least low`);
    if (index === 0) return high.minus(low);
    const previousClose = positiveDecimal(candles[index - 1].close, `candles[${index - 1}].close`);
    return DecimalMax(
      high.minus(low),
      high.minus(previousClose).abs(),
      low.minus(previousClose).abs(),
    );
  });
  if (ranges.length < period) return null;
  let atr = mean(ranges.slice(0, period));
  for (const range of ranges.slice(period))
    atr = atr
      .times(period - 1)
      .plus(range)
      .div(period);
  return formatIndicator(atr);
}

function DecimalMax(...values: Decimal[]): Decimal {
  return values.reduce(
    (maximum, value) => (value.gt(maximum) ? value : maximum),
    new IndicatorDecimal(0),
  );
}

export function calculateNormalizedAtr(atr: string | null, close: string): string | null {
  if (atr === null) return null;
  const closeValue = positiveDecimal(close, 'close');
  const atrValue = new IndicatorDecimal(atr);
  return formatIndicator(atrValue.div(closeValue).times(100));
}
