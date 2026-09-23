export const DAILY_PIPELINE_VERSION = 'daily-pipeline-v1';

export enum JobTriggerSource {
  SCHEDULED = 'SCHEDULED',
  MANUAL = 'MANUAL',
  CATCH_UP = 'CATCH_UP',
}

export enum DailyPipelineStatus {
  STARTED = 'STARTED',
  SUCCESS = 'SUCCESS',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
}

export interface MarketJobData {
  readonly triggerSource: JobTriggerSource;
  readonly requestedAt?: string;
}

export interface PostMarketJobData extends MarketJobData {
  readonly marketDate?: string;
  readonly forceRun?: boolean;
}

export interface CandidateAnalysisJobData {
  readonly pipelineRunId: string;
  readonly candidateId: string;
  readonly marketDate: string;
  readonly evidenceHash: string;
  readonly failureStage?: CandidateFailureStage;
}

export interface CandidateAnalysisSummary {
  readonly candidateId: string;
  readonly newsEnriched: boolean;
  readonly fastAnalyzed: boolean;
  readonly deepAnalyzed: boolean;
  readonly qualified: boolean;
  readonly wait: boolean;
  readonly rejected: boolean;
  readonly notified: boolean;
  readonly analysisIssue?: {
    readonly stage: CandidateFailureStage;
    readonly kind: 'NEWS' | 'FAST_AI' | 'DEEP_AI' | 'DECISION';
    readonly code: string;
  };
}

export type CandidateFailureStage = 'NEWS' | 'AI' | 'DECISION' | 'NOTIFICATION';
