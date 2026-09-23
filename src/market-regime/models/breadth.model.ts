import { TechnicalIndicatorSnapshot } from '../../indicators/models/technical-indicators.model';

export interface UniverseIndicatorObservation {
  readonly instrumentId: string;
  readonly sector: string | null;
  readonly indicators: TechnicalIndicatorSnapshot;
}

export interface BreadthSnapshot {
  readonly totalUniverse: number;
  readonly totalEligible: number;
  readonly totalExcluded: number;
  readonly aboveEma20: number;
  readonly aboveEma50: number;
  readonly aboveSma200: number;
  readonly percentAboveEma20: string | null;
  readonly percentAboveEma50: string | null;
  readonly percentAboveSma200: string | null;
}

export interface SectorParticipationSnapshot {
  readonly totalClassifiedInstruments: number;
  readonly totalExcludedInstruments: number;
  readonly eligibleSectors: number;
  readonly positiveSectors: number;
  readonly negativeSectors: number;
  readonly neutralSectors: number;
  readonly positiveSectorPercent: string | null;
}
