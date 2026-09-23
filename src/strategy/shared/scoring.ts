import Decimal from 'decimal.js';
import { StrategyEvidence, StrategyScoreComponent } from '../models/strategy-score-component.model';

// Private arithmetic context: unrelated callers changing Decimal.set cannot alter strategies.
const StrategyDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const d = (value: Decimal.Value): Decimal => new StrategyDecimal(value);
export const fixed = (value: Decimal.Value): string => d(value).toFixed(4);
export const clampScore = (value: Decimal): Decimal =>
  value.lt(0) ? d(0) : value.gt(100) ? d(100) : value;
export const mean = (values: readonly Decimal[]): Decimal =>
  values.reduce((sum, value) => sum.plus(value), d(0)).div(values.length);
export const distancePercent = (value: Decimal.Value, baseline: Decimal.Value): Decimal =>
  d(value).div(baseline).minus(1).times(100);

/** Maps low to 0 and high to 100, clipping outside the interval. */
export function scoreLinearRange(value: Decimal, low: string, high: string): Decimal {
  return clampScore(value.minus(low).div(d(high).minus(low)).times(100));
}

export type ScoreBand = readonly [string, string, string, string];
/** Trapezoid: zero at outer bounds, full credit throughout the preferred interval. */
export function scoreBand(
  value: Decimal,
  [minimum, preferredLow, preferredHigh, maximum]: ScoreBand,
): Decimal {
  if (value.lt(preferredLow)) return scoreLinearRange(value, minimum, preferredLow);
  if (value.gt(preferredHigh)) return d(100).minus(scoreLinearRange(value, preferredHigh, maximum));
  return d(100);
}

export function component(
  score: Decimal,
  weight: string,
  evidence: StrategyEvidence,
): StrategyScoreComponent {
  const bounded = clampScore(score);
  return {
    score: fixed(bounded),
    weight: fixed(weight),
    weightedContribution: fixed(bounded.times(weight).div(100)),
    evidence,
  };
}

export function weightedScore(
  components: Readonly<Record<string, StrategyScoreComponent>>,
): Decimal {
  const entries = Object.values(components);
  const totalWeight = entries.reduce((sum, item) => sum.plus(item.weight), d(0));
  if (!totalWeight.eq(100)) throw new Error('Strategy weights must total 100');
  // Summing displayed contributions makes the audit arithmetic exactly reproducible.
  return entries.reduce((sum, item) => sum.plus(item.weightedContribution), d(0));
}
