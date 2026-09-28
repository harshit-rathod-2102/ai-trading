export const PIPELINE_JOB_SUMMARY_VERSION = 'pipeline-job-summary-v2';

export interface PipelineJobSummaryDispatch {
  readonly jobId: string;
  readonly triggerSource: string;
  readonly requestedAt: string;
}

export interface PipelineJobSummarySnapshot {
  readonly version: string;
  readonly pipelineRunId: string;
  readonly jobTime: string;
  readonly completedAt: string;
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
  readonly aiSummary: string;
  readonly aiGenerated: boolean;
  readonly aiWarning: string | null;
}

export interface PipelineJobSummaryDeliveryResult {
  readonly summaryId: string;
  readonly pipelineRunId: string;
  readonly jobId: string;
  readonly status: string;
  readonly providerMessageId: string | null;
  readonly reused: boolean;
}
