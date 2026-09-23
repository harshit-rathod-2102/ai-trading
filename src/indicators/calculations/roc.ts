import { formatIndicator, parsePositiveSeries, periodIsValid } from './decimal';

export function calculateRoc(values: readonly string[], period: number): string | null {
  periodIsValid(period);
  const parsed = parsePositiveSeries(values);
  if (parsed.length < period + 1) return null;
  return formatIndicator(
    parsed
      .at(-1)!
      .div(parsed[parsed.length - period - 1])
      .minus(1)
      .times(100),
  );
}
