import { PortfolioRiskSnapshot } from './portfolio-risk-snapshot.model';
import { RiskRejectionCode } from './risk-rejection-code.enum';
import { RiskWarningCode } from './risk-warning-code.enum';

export interface RiskPlanResult {
  readonly accepted: boolean;
  readonly riskVersion: string;
  readonly proposedEntry: string | null;
  readonly structuralStop: string | null;
  readonly riskPerShare: string | null;
  readonly riskBudget: string | null;
  readonly quantityByRisk: number;
  readonly quantityByPositionCap: number;
  readonly quantityByAvailableCapital: number;
  readonly quantityByPortfolioRisk: number;
  readonly quantityBySectorExposure: number | null;
  readonly recommendedQuantity: number;
  readonly capitalRequired: string | null;
  readonly plannedLossAtStop: string | null;
  readonly target1: string | null;
  readonly target2: string | null;
  readonly rewardRiskToTarget1: string | null;
  readonly rewardRiskToTarget2: string | null;
  readonly portfolioRiskBefore: string;
  readonly portfolioRiskAfter: string;
  readonly sectorExposureBefore: string | null;
  readonly sectorExposureAfter: string | null;
  readonly rejectionCodes: readonly RiskRejectionCode[];
  readonly reasons: readonly string[];
  readonly warningCodes: readonly RiskWarningCode[];
  readonly warnings: readonly string[];
  readonly portfolioSnapshot: PortfolioRiskSnapshot | null;
  readonly snapshot: Readonly<Record<string, unknown>>;
  readonly evaluatedAt: Date;
}
