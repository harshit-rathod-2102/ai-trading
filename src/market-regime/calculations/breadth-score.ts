import { BreadthSnapshot, UniverseIndicatorObservation } from '../models/breadth.model';
import { MarketRegimeComponent } from '../models/market-regime-components.model';
import { RegimeDecimal, average, decimal, formatScore } from './numeric';

function percent(count: number, total: number): string {
  return new RegimeDecimal(count).div(total).times(100).toFixed(4);
}

export function calculateBreadthSnapshot(
  observations: readonly UniverseIndicatorObservation[],
): BreadthSnapshot {
  let aboveEma20 = 0;
  let aboveEma50 = 0;
  let aboveSma200 = 0;
  let totalEligible = 0;
  for (const observation of observations) {
    const { close, ema20, ema50, sma200 } = observation.indicators;
    if ([close, ema20, ema50, sma200].some((value) => value === null)) continue;
    const current = decimal(close!, `${observation.instrumentId} close`);
    if (current.gt(decimal(ema20!, `${observation.instrumentId} EMA20`))) aboveEma20 += 1;
    if (current.gt(decimal(ema50!, `${observation.instrumentId} EMA50`))) aboveEma50 += 1;
    if (current.gt(decimal(sma200!, `${observation.instrumentId} SMA200`))) aboveSma200 += 1;
    totalEligible += 1;
  }
  return {
    totalUniverse: observations.length,
    totalEligible,
    totalExcluded: observations.length - totalEligible,
    aboveEma20,
    aboveEma50,
    aboveSma200,
    percentAboveEma20: totalEligible ? percent(aboveEma20, totalEligible) : null,
    percentAboveEma50: totalEligible ? percent(aboveEma50, totalEligible) : null,
    percentAboveSma200: totalEligible ? percent(aboveSma200, totalEligible) : null,
  };
}

export function calculateBreadthScore(snapshot: BreadthSnapshot): MarketRegimeComponent | null {
  const values = [
    snapshot.percentAboveEma20,
    snapshot.percentAboveEma50,
    snapshot.percentAboveSma200,
  ];
  if (!snapshot.totalEligible || values.some((value) => value === null)) return null;
  const percentages = values.map((value, index) => decimal(value!, `breadth percentage ${index}`));
  if (percentages.some((value) => value.lt(0) || value.gt(100)))
    throw new RangeError('breadth percentages must be between 0 and 100');
  const scores = percentages.map((value) => value.times(2).minus(100));
  return { score: formatScore(average(scores)), evidence: { ...snapshot } };
}
