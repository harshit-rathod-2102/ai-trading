import { fixed, positiveMonitorDecimal } from './numeric';

export function initialRiskPerShare(actualEntry: string, initialStop: string) {
  const entry = positiveMonitorDecimal(actualEntry, 'actualEntry');
  const stop = positiveMonitorDecimal(initialStop, 'initialStop');
  const risk = entry.minus(stop);
  if (risk.lte(0)) throw new RangeError('initial risk per share must be greater than zero');
  return risk;
}

export function calculateRMultiple(
  currentPrice: string,
  actualEntry: string,
  initialStop: string,
): string {
  const current = positiveMonitorDecimal(currentPrice, 'currentPrice');
  const entry = positiveMonitorDecimal(actualEntry, 'actualEntry');
  return fixed(current.minus(entry).div(initialRiskPerShare(actualEntry, initialStop)));
}
