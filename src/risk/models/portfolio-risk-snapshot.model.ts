export interface PortfolioRiskSnapshot {
  readonly openTrades: number;
  readonly maxOpenTrades: number;
  readonly capitalAllocated: string;
  readonly availableCapital: string;
  readonly portfolioRiskBefore: string;
  readonly maxPortfolioRisk: string;
  readonly remainingPortfolioRisk: string;
  readonly sector: string | null;
  readonly sectorExposureBefore: string | null;
  readonly maxSectorExposure: string | null;
  readonly remainingSectorCapacity: string | null;
}
