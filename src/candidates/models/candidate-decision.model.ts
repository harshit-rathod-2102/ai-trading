import { CandidateStatus } from '../../common/enums/candidate-status.enum';
import { AiAnalysisTier } from '../../ai-analysis/models/ai-analysis-tier.enum';
import { DeepReviewRecommendation } from '../../ai-analysis/models/deep-review-recommendation.enum';

export const CANDIDATE_DECISION_VERSION = 'candidate-decision-v1';

export enum CandidateDecisionOutcome {
  QUALIFIED = 'QUALIFIED',
  WAIT = 'WAIT',
  REJECTED = 'REJECTED',
}

export enum CandidateDecisionFailureCode {
  CANDIDATE_NOT_ELIGIBLE = 'CANDIDATE_NOT_ELIGIBLE',
  NEWS_ENRICHMENT_REQUIRED = 'NEWS_ENRICHMENT_REQUIRED',
  FAST_ANALYSIS_REQUIRED = 'FAST_ANALYSIS_REQUIRED',
  DEEP_REVIEW_REQUIRED = 'DEEP_REVIEW_REQUIRED',
  AI_ANALYSIS_INCOMPLETE = 'AI_ANALYSIS_INCOMPLETE',
  POLICY_INCONSISTENCY = 'POLICY_INCONSISTENCY',
}

export interface CandidateDecisionSnapshot {
  readonly version: typeof CANDIDATE_DECISION_VERSION;
  readonly outcome: CandidateDecisionOutcome;
  readonly previousStatus: CandidateStatus.NEW;
  readonly status: CandidateStatus.QUALIFIED | CandidateStatus.WAIT | CandidateStatus.REJECTED;
  readonly sourceTier: AiAnalysisTier;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
  readonly aiRecommendation?: DeepReviewRecommendation;
  readonly fastEvidenceHash?: string;
  readonly deepEvidenceHash?: string;
  readonly routingVersion?: string;
  readonly decidedAt: string;
}

export interface CandidateDecisionSuccess extends CandidateDecisionSnapshot {
  readonly candidateId: string;
  readonly finalized: true;
  readonly reusedExistingDecision: boolean;
  readonly newStatus: CandidateDecisionSnapshot['status'];
}

export interface CandidateDecisionIncomplete {
  readonly candidateId: string;
  readonly finalized: false;
  readonly previousStatus: CandidateStatus;
  readonly newStatus: CandidateStatus;
  readonly errorCode: CandidateDecisionFailureCode;
  readonly retryable: boolean;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
}

export type CandidateDecisionResult = CandidateDecisionSuccess | CandidateDecisionIncomplete;
