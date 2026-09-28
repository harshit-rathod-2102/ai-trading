export type StrategyEvidence = Readonly<Record<string, string | number | boolean | null>>;

export interface StrategyScoreComponent {
  readonly score: string;
  readonly weight: string;
  readonly weightedContribution: string;
  readonly evidence: StrategyEvidence;
}
