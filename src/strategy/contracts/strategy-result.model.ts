import { StrategyName } from '../models/strategy-name.enum';
import { StrategyEvidence, StrategyScoreComponent } from '../models/strategy-score-component.model';

export type RejectionCode = 'INSUFFICIENT_HISTORY' | 'INVALID_DATA' | 'INSUFFICIENT_LIQUIDITY'
  | 'RISK_OFF_REGIME' | 'REGIME_NOT_ALLOWED' | 'TREND_NOT_ESTABLISHED' | 'NO_BREAKOUT'
  | 'PULLBACK_TOO_DEEP' | 'PULLBACK_NOT_PRESENT' | 'SETUP_SCORE_TOO_LOW';
export type WarningCode = 'SECTOR_CONTEXT_UNAVAILABLE' | 'SECTOR_CONTEXT_INVALID'
  | 'RELATIVE_STRENGTH_126_UNAVAILABLE' | 'MARKET_REGIME_LOW_CONFIDENCE' | 'MARKET_REGIME_WARNINGS';

export interface StrategyResult {
  readonly strategy: StrategyName;
  readonly strategyVersion: string;
  readonly qualified: boolean;
  readonly score: string;
  readonly qualificationThreshold: string;
  readonly components: Readonly<Record<string, StrategyScoreComponent>>;
  readonly reasons: readonly string[];
  readonly rejectionCodes: readonly RejectionCode[];
  readonly rejectionReasons: readonly string[];
  readonly warningCodes: readonly WarningCode[];
  readonly warnings: readonly string[];
  readonly setupContext: StrategyEvidence;
  readonly inputEvidence: StrategyEvidence;
  readonly evaluatedAt: Date;
}
