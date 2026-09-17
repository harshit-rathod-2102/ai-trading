import Decimal from 'decimal.js';

export const RegimeDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function decimal(value: string, label: string): Decimal {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) {
    throw new MarketRegimeInputError(`${label} must be a finite decimal string`);
  }
  const parsed = new RegimeDecimal(value);
  if (!parsed.isFinite()) throw new MarketRegimeInputError(`${label} must be finite`);
  return parsed;
}

export function formatScore(value: Decimal): string {
  const bounded = Decimal.max(-100, Decimal.min(100, value));
  return bounded.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
}

export function average(values: readonly Decimal[]): Decimal {
  return values.reduce((sum, value) => sum.plus(value), new RegimeDecimal(0)).div(values.length);
}

export class MarketRegimeInputError extends Error {
  constructor(message: string) { super(message); this.name = 'MarketRegimeInputError'; }
}
