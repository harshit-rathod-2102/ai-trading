import { formatIndicator, mean, parsePositiveSeries, periodIsValid } from './decimal';

export function calculateSma(values: readonly string[], period: number): string | null {
  periodIsValid(period);
  const parsed = parsePositiveSeries(values);
  if (parsed.length < period) return null;
  return formatIndicator(mean(parsed.slice(-period)));
}
