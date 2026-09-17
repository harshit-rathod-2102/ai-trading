import Decimal from 'decimal.js';

export const RiskDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function decimal(value: string | number, label: string): Decimal {
  const result = new RiskDecimal(value);
  if (!result.isFinite()) throw new RangeError(`${label} must be finite`);
  return result;
}

export function positive(value: string | number, label: string): Decimal {
  const result = decimal(value, label);
  if (result.lte(0)) throw new RangeError(`${label} must be greater than zero`);
  return result;
}

export function money(value: Decimal): string {
  return value.toDecimalPlaces(4).toFixed(4);
}

export function ratio(value: Decimal): string {
  return value.toDecimalPlaces(4).toFixed(4);
}

export function quantity(value: Decimal, maximum: number): number {
  if (value.lte(0)) return 0;
  const floored = value.floor();
  return floored.gt(maximum) ? maximum : floored.toNumber();
}
