import Decimal from 'decimal.js';

export const IndicatorDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function positiveDecimal(value: string, label = 'value'): Decimal {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) {
    throw new RangeError(`${label} must be a plain non-negative decimal string`);
  }
  const parsed = new IndicatorDecimal(value);
  if (!parsed.isFinite() || parsed.lte(0))
    throw new RangeError(`${label} must be greater than zero`);
  return parsed;
}

export function nonNegativeDecimal(value: string, label = 'value'): Decimal {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) {
    throw new RangeError(`${label} must be a plain non-negative decimal string`);
  }
  const parsed = new IndicatorDecimal(value);
  if (!parsed.isFinite() || parsed.lt(0)) throw new RangeError(`${label} must not be negative`);
  return parsed;
}

export function parsePositiveSeries(values: readonly string[]): Decimal[] {
  return values.map((value, index) => positiveDecimal(value, `values[${index}]`));
}

export function periodIsValid(period: number): void {
  if (!Number.isInteger(period) || period <= 0)
    throw new RangeError('period must be a positive integer');
}

export function formatIndicator(value: Decimal): string {
  return value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
}

export function mean(values: readonly Decimal[]): Decimal {
  return values
    .reduce((total, value) => total.plus(value), new IndicatorDecimal(0))
    .div(values.length);
}

export function percentageDistance(value: string, baseline: string | null): string | null {
  if (baseline === null) return null;
  const current = positiveDecimal(value, 'value');
  const comparison = positiveDecimal(baseline, 'baseline');
  return formatIndicator(current.div(comparison).minus(1).times(100));
}
