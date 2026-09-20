import Decimal from 'decimal.js';

export const MonitorDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function monitorDecimal(value: string | number, label: string): Decimal {
  const result = new MonitorDecimal(value);
  if (!result.isFinite()) throw new RangeError(`${label} must be finite`);
  return result;
}

export function positiveMonitorDecimal(value: string | number, label: string): Decimal {
  const result = monitorDecimal(value, label);
  if (result.lte(0)) throw new RangeError(`${label} must be greater than zero`);
  return result;
}

export function fixed(value: Decimal): string {
  return value.toDecimalPlaces(4).toFixed(4);
}
