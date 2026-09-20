import { fixed, positiveMonitorDecimal } from './numeric';
import { initialRiskPerShare } from './trade-r-multiple';

export interface ExcursionResult {
  readonly maxFavorablePrice: string;
  readonly maxFavorableR: string;
  readonly maxAdversePrice: string;
  readonly maxAdverseR: string;
}

export function calculateExcursion(
  currentPrice: string,
  actualEntry: string,
  initialStop: string,
  previousFavorablePrice: string | null,
  previousAdversePrice: string | null,
): ExcursionResult {
  const current = positiveMonitorDecimal(currentPrice, 'currentPrice');
  const entry = positiveMonitorDecimal(actualEntry, 'actualEntry');
  const previousHigh = previousFavorablePrice
    ? positiveMonitorDecimal(previousFavorablePrice, 'maxFavorablePrice') : entry;
  const previousLow = previousAdversePrice
    ? positiveMonitorDecimal(previousAdversePrice, 'maxAdversePrice') : entry;
  const favorable = [entry, current, previousHigh].reduce((left, right) =>
    right.gt(left) ? right : left);
  const adverse = [entry, current, previousLow].reduce((left, right) =>
    right.lt(left) ? right : left);
  const risk = initialRiskPerShare(actualEntry, initialStop);
  return {
    maxFavorablePrice: fixed(favorable),
    maxFavorableR: fixed(favorable.minus(entry).div(risk)),
    maxAdversePrice: fixed(adverse),
    maxAdverseR: fixed(adverse.minus(entry).div(risk)),
  };
}
