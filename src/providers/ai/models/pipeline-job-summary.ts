export interface PipelineJobSummaryInput {
  readonly marketDate: string;
  readonly triggerSource: string;
  readonly status: string;
  readonly regime: string;
  readonly regimeScore: string;
  readonly indexSymbols: readonly string[];
  readonly universeEquities: number;
  readonly eligibleEquities: number;
  readonly evaluatedEquities: number;
  readonly qualifiedSetups: number;
  readonly shortlistedCandidates: number;
}

export interface PipelineJobSummaryResult {
  readonly summary: string;
  readonly provider: string;
  readonly requestedModel: string;
  readonly resolvedModel: string;
  readonly promptVersion: string;
  readonly requestId?: string;
}
