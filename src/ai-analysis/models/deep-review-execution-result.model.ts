import { DeepReviewResult } from './deep-review-result.model';

export enum DeepReviewErrorCode {
  PROVIDER_NOT_CONFIGURED = 'AI_PROVIDER_NOT_CONFIGURED',
  PROVIDER_AUTH = 'AI_PROVIDER_AUTH',
  PROVIDER_RATE_LIMIT = 'AI_PROVIDER_RATE_LIMIT',
  PROVIDER_QUOTA = 'AI_PROVIDER_QUOTA',
  PROVIDER_TIMEOUT = 'AI_PROVIDER_TIMEOUT',
  PROVIDER_UNAVAILABLE = 'AI_PROVIDER_UNAVAILABLE',
  OUTPUT_INVALID = 'AI_OUTPUT_INVALID',
  REQUEST_REJECTED = 'AI_REQUEST_REJECTED',
  EVIDENCE_CHANGED = 'AI_EVIDENCE_CHANGED',
}

export interface DeepReviewExecutionResult {
  readonly candidateId: string;
  readonly success: boolean;
  readonly reusedExistingAnalysis: boolean;
  readonly evidenceHash?: string;
  readonly deepAnalysis?: DeepReviewResult;
  readonly warnings: readonly string[];
  readonly errorCode?: DeepReviewErrorCode;
  readonly retryable?: boolean;
}
