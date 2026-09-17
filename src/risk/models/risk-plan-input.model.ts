import { TechnicalIndicatorSnapshot } from '../../indicators/models/technical-indicators.model';
import { StrategyResult } from '../../strategy/contracts/strategy-result.model';
import { StrategyName } from '../../strategy/models/strategy-name.enum';
import { TradingProfile } from '../../trading-profile/entities/trading-profile.entity';

export interface RiskSetup {
  readonly scanResultId: string;
  readonly instrumentId: string;
  readonly symbol: string;
  readonly exchange: string;
  readonly sector: string | null;
  readonly strategy: StrategyName;
  readonly strategyVersion: string;
  readonly strategyScore: string;
  readonly rankingScore: string;
  readonly strategyRank: number;
  readonly globalRank: number;
  readonly technicalSnapshot: TechnicalIndicatorSnapshot;
  readonly strategyResult: StrategyResult;
}

export interface OpenTradeRiskView {
  readonly tradeId: string;
  readonly symbol: string;
  readonly sector: string | null;
  readonly quantity: number;
  readonly actualEntry: string;
  readonly currentPrice: string | null;
  readonly currentStop: string;
  readonly currentPositionValue: string | null;
  readonly isPartiallyClosed: boolean;
}

export interface RiskPlanInput {
  readonly setup: RiskSetup;
  readonly tradingProfile: TradingProfile | null;
  readonly openTrades: readonly OpenTradeRiskView[];
  readonly evaluatedAt: Date;
}
