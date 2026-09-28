import { MarketRegime } from '../../market-regime/models/market-regime.enum';
import { ScoreBand } from './scoring';

export interface CommonStrategyConfig {
  readonly minimumHistory: number;
  readonly qualificationThreshold: string;
  readonly minimumAverageTradedValue: string;
  readonly liquidityPeriod: number;
  readonly blockedRegimes: readonly MarketRegime[];
  readonly regimeScores: Readonly<Record<MarketRegime, string>>;
  readonly missingSectorScore: string;
  readonly relativeStrengthRange: readonly [string, string];
  readonly rsiBand: ScoreBand;
  readonly roc20Range: readonly [string, string];
  readonly roc50Range: readonly [string, string];
  readonly normalizedAtrBand: ScoreBand;
}
