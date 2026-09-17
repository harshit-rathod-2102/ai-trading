import { IndicatorDecimal, formatIndicator, mean, parsePositiveSeries, periodIsValid } from './decimal';

// Seeds the EMA with the SMA of the first `period` observations, then applies k=2/(period+1).
export function calculateEma(values: readonly string[], period: number): string | null {
  periodIsValid(period);
  const parsed = parsePositiveSeries(values);
  if (parsed.length < period) return null;
  const multiplier = new IndicatorDecimal(2).div(period + 1);
  let ema = mean(parsed.slice(0, period));
  for (const value of parsed.slice(period)) ema = value.minus(ema).times(multiplier).plus(ema);
  return formatIndicator(ema);
}
