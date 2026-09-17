import Decimal from 'decimal.js';
import { SectorParticipationSnapshot, UniverseIndicatorObservation } from '../models/breadth.model';
import { MarketRegimeComponent } from '../models/market-regime-components.model';
import { RegimeDecimal, decimal, formatScore } from './numeric';

function median(values: Decimal[]): Decimal {
  const sorted = [...values].sort((left, right) => left.comparedTo(right));
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : sorted[middle - 1].plus(sorted[middle]).div(2);
}

export function calculateSectorParticipationSnapshot(
  observations: readonly UniverseIndicatorObservation[],
): SectorParticipationSnapshot {
  const groups = new Map<string, Decimal[]>();
  let included = 0;
  for (const observation of observations) {
    const sector = observation.sector?.trim();
    const roc20 = observation.indicators.roc20;
    if (!sector || roc20 === null) continue;
    const values = groups.get(sector) ?? [];
    values.push(decimal(roc20, `${observation.instrumentId} ROC20`));
    groups.set(sector, values);
    included += 1;
  }
  let positiveSectors = 0;
  let negativeSectors = 0;
  let neutralSectors = 0;
  for (const values of groups.values()) {
    const value = median(values);
    if (value.gt(0)) positiveSectors += 1;
    else if (value.lt(0)) negativeSectors += 1;
    else neutralSectors += 1;
  }
  const eligibleSectors = groups.size;
  return {
    totalClassifiedInstruments: included, totalExcludedInstruments: observations.length - included,
    eligibleSectors, positiveSectors, negativeSectors, neutralSectors,
    positiveSectorPercent: eligibleSectors ? new RegimeDecimal(positiveSectors).div(eligibleSectors).times(100).toFixed(4) : null,
  };
}

export function calculateSectorParticipationScore(
  snapshot: SectorParticipationSnapshot,
): MarketRegimeComponent | null {
  if (!snapshot.eligibleSectors || snapshot.positiveSectorPercent === null) return null;
  const percentage = decimal(snapshot.positiveSectorPercent, 'positive sector percentage');
  if (percentage.lt(0) || percentage.gt(100)) throw new RangeError('positive sector percentage must be between 0 and 100');
  const score = percentage.times(2).minus(100);
  return { score: formatScore(score), evidence: { ...snapshot } };
}
