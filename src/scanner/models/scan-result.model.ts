import { TechnicalIndicatorSnapshot } from '../../indicators/models/technical-indicators.model';
import { MarketRegimeResult } from '../../market-regime/models/market-regime-result.model';
import { StrategyResult } from '../../strategy/contracts/strategy-result.model';
import { StrategyName } from '../../strategy/models/strategy-name.enum';

export type RankingEvidence = Readonly<Record<string, unknown>>;

export interface QualifiedSetup {
  readonly instrumentId: string;
  readonly symbol: string;
  readonly exchange: string;
  readonly sector: string | null;
  readonly strategy: StrategyName;
  readonly strategyVersion: string;
  readonly strategyScore: string;
  readonly strategyResult: StrategyResult;
  readonly technicalSnapshot: TechnicalIndicatorSnapshot;
  readonly marketRegime: MarketRegimeResult;
}

export interface RankedSetup extends QualifiedSetup {
  rankingScore: string;
  globalRankingScore: string;
  strategyRank: number;
  strategyQualifiedCount: number;
  globalRank: number;
  globalQualifiedCount: number;
  isShortlisted: boolean;
  rankingFeatures: RankingEvidence;
}

export type ScanExclusionCode = 'INSUFFICIENT_HISTORY' | 'INVALID_DATA';

export interface ScanExclusion {
  readonly instrumentId: string;
  readonly symbol: string;
  readonly code: ScanExclusionCode;
  readonly message: string;
}

export interface UniverseEvaluationResult {
  readonly eligibleUniverse: number;
  readonly evaluatedSymbols: number;
  readonly qualifiedSetups: readonly QualifiedSetup[];
  readonly exclusions: readonly ScanExclusion[];
}
