import { TechnicalIndicatorSnapshot } from '../../indicators/models/technical-indicators.model';
import { BreadthSnapshot, SectorParticipationSnapshot } from './breadth.model';

export type MarketDataFreshness = 'CURRENT' | 'STALE' | 'UNKNOWN';

export interface MarketRegimeInput {
  readonly marketDate: string;
  readonly calculatedAt: Date;
  readonly niftyFreshness: MarketDataFreshness;
  readonly niftyIndicators: TechnicalIndicatorSnapshot;
  readonly vixFreshness?: MarketDataFreshness;
  readonly vixIndicators?: TechnicalIndicatorSnapshot;
  readonly breadth?: BreadthSnapshot;
  readonly sectorParticipation?: SectorParticipationSnapshot;
  readonly warnings?: readonly string[];
}
