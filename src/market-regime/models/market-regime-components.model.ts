export type RegimeEvidenceValue = string | number | boolean | null;

export interface MarketRegimeComponent {
  readonly score: string;
  readonly evidence: Readonly<Record<string, RegimeEvidenceValue>>;
}

export interface MarketRegimeComponents {
  readonly trend: MarketRegimeComponent;
  readonly momentum: MarketRegimeComponent;
  readonly volatility: MarketRegimeComponent;
  readonly breadth?: MarketRegimeComponent;
  readonly sectorParticipation?: MarketRegimeComponent;
}
