import { IndicatorDecimal, formatIndicator, parsePositiveSeries, periodIsValid } from './decimal';

export function calculateRsi(values: readonly string[], period = 14): string | null {
  periodIsValid(period);
  const parsed = parsePositiveSeries(values);
  if (parsed.length < period + 1) return null;
  let gains = new IndicatorDecimal(0);
  let losses = new IndicatorDecimal(0);
  for (let index = 1; index <= period; index += 1) {
    const change = parsed[index].minus(parsed[index - 1]);
    if (change.gt(0)) gains = gains.plus(change);
    else losses = losses.plus(change.abs());
  }
  let averageGain = gains.div(period);
  let averageLoss = losses.div(period);
  for (let index = period + 1; index < parsed.length; index += 1) {
    const change = parsed[index].minus(parsed[index - 1]);
    const gain = change.gt(0) ? change : new IndicatorDecimal(0);
    const loss = change.lt(0) ? change.abs() : new IndicatorDecimal(0);
    averageGain = averageGain
      .times(period - 1)
      .plus(gain)
      .div(period);
    averageLoss = averageLoss
      .times(period - 1)
      .plus(loss)
      .div(period);
  }
  if (averageGain.isZero() && averageLoss.isZero()) return '50.0000';
  if (averageLoss.isZero()) return '100.0000';
  if (averageGain.isZero()) return '0.0000';
  const relativeStrength = averageGain.div(averageLoss);
  return formatIndicator(
    new IndicatorDecimal(100).minus(new IndicatorDecimal(100).div(relativeStrength.plus(1))),
  );
}
