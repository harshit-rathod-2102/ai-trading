import Decimal from 'decimal.js';
import { RISK_V1_CONFIG } from '../config/risk-v1.config';
import { quantity } from './numeric';

export interface PositionSizingInput {
  readonly riskBudget: Decimal;
  readonly riskPerShare: Decimal;
  readonly maxPositionValue: Decimal;
  readonly availableCapital: Decimal;
  readonly remainingPortfolioRisk: Decimal;
  readonly remainingSectorCapacity: Decimal | null;
  readonly entry: Decimal;
}

export interface PositionSizingResult {
  readonly quantityByRisk: number;
  readonly quantityByPositionCap: number;
  readonly quantityByAvailableCapital: number;
  readonly quantityByPortfolioRisk: number;
  readonly quantityBySectorExposure: number | null;
  readonly quantityBeforeHardRejections: number;
}

export function calculatePositionSizing(input: PositionSizingInput): PositionSizingResult {
  const maximum = RISK_V1_CONFIG.maximumQuantity;
  const quantityByRisk = quantity(input.riskBudget.div(input.riskPerShare), maximum);
  const quantityByPositionCap = quantity(input.maxPositionValue.div(input.entry), maximum);
  const quantityByAvailableCapital = quantity(input.availableCapital.div(input.entry), maximum);
  const quantityByPortfolioRisk = quantity(
    input.remainingPortfolioRisk.div(input.riskPerShare),
    maximum,
  );
  const quantityBySectorExposure =
    input.remainingSectorCapacity === null
      ? null
      : quantity(input.remainingSectorCapacity.div(input.entry), maximum);
  const applicable = [
    quantityByRisk,
    quantityByPositionCap,
    quantityByAvailableCapital,
    quantityByPortfolioRisk,
    ...(quantityBySectorExposure === null ? [] : [quantityBySectorExposure]),
  ];
  return {
    quantityByRisk,
    quantityByPositionCap,
    quantityByAvailableCapital,
    quantityByPortfolioRisk,
    quantityBySectorExposure,
    quantityBeforeHardRejections: Math.min(...applicable),
  };
}
