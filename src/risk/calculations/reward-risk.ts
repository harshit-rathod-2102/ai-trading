import Decimal from 'decimal.js';
import { RISK_V1_CONFIG } from '../config/risk-v1.config';
import { decimal } from './numeric';
import { TradeGeometry } from './stop-selection';

export interface RewardRiskResult {
  readonly target1: Decimal;
  readonly target2: Decimal;
  readonly rewardRiskToTarget1: Decimal;
  readonly rewardRiskToTarget2: Decimal;
  readonly target1Method: 'STRUCTURAL_TARGET' | 'PLANNED_R_MULTIPLE';
  readonly target1Reference: string | null;
}

export function calculateRewardRisk(
  geometry: TradeGeometry,
  riskPerShare: Decimal,
): RewardRiskResult {
  const plannedTarget1 = geometry.entry.plus(riskPerShare.times(RISK_V1_CONFIG.target1R));
  const target1 = geometry.technicalTarget ?? plannedTarget1;
  const plannedTarget2 = geometry.entry.plus(riskPerShare.times(RISK_V1_CONFIG.target2R));
  const afterTarget1 = target1.plus(riskPerShare);
  const target2 = plannedTarget2.gte(afterTarget1) ? plannedTarget2 : afterTarget1;
  return {
    target1,
    target2,
    rewardRiskToTarget1: target1.minus(geometry.entry).div(riskPerShare),
    rewardRiskToTarget2: target2.minus(geometry.entry).div(riskPerShare),
    target1Method: geometry.technicalTarget ? 'STRUCTURAL_TARGET' : 'PLANNED_R_MULTIPLE',
    target1Reference: geometry.technicalTargetType,
  };
}
