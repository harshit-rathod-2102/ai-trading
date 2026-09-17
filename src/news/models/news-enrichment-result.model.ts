import { CandidateNewsSnapshot } from './candidate-news-snapshot.model';

export enum NewsEnrichmentErrorCode {
  CANDIDATE_NOT_FOUND = 'CANDIDATE_NOT_FOUND',
  CANDIDATE_NOT_ELIGIBLE = 'CANDIDATE_NOT_ELIGIBLE',
  NEWS_PROVIDER_AUTH = 'NEWS_PROVIDER_AUTH',
  NEWS_PROVIDER_RATE_LIMIT = 'NEWS_PROVIDER_RATE_LIMIT',
  NEWS_PROVIDER_QUOTA = 'NEWS_PROVIDER_QUOTA',
  NEWS_PROVIDER_UNAVAILABLE = 'NEWS_PROVIDER_UNAVAILABLE',
  NEWS_PROVIDER_TIMEOUT = 'NEWS_PROVIDER_TIMEOUT',
  NEWS_PROVIDER_REJECTED = 'NEWS_PROVIDER_REJECTED',
  NEWS_NORMALIZATION_FAILED = 'NEWS_NORMALIZATION_FAILED',
}

export interface NewsEnrichmentResult {
  readonly candidateId: string;
  readonly success: boolean;
  readonly reusedExistingSnapshot: boolean;
  readonly articleCount: number;
  readonly snapshot?: CandidateNewsSnapshot;
  readonly warnings: readonly string[];
  readonly errorCode?: NewsEnrichmentErrorCode;
  readonly retryable?: boolean;
}
