import { ProviderRequestContext } from '../provider-request-context';
import { CandidateAnalysisInput } from './models/candidate-analysis-input';
import { CandidateAnalysisResult } from './models/candidate-analysis-result';
import { FastTriageInput, FastTriageResult } from '../../ai-analysis/models/fast-triage-result.model';
import { AiAnalysisOptions } from './models/ai-analysis-options';
import { DeepReviewInput, DeepReviewResult } from '../../ai-analysis/models/deep-review-result.model';

export interface AiProvider {
  analyzeCandidate(
    input: CandidateAnalysisInput,
    context?: ProviderRequestContext,
  ): Promise<CandidateAnalysisResult>;

  triageCandidate(
    input: FastTriageInput,
    options: AiAnalysisOptions,
    context?: ProviderRequestContext,
  ): Promise<FastTriageResult>;

  reviewCandidate(
    input: DeepReviewInput,
    options: AiAnalysisOptions,
    context?: ProviderRequestContext,
  ): Promise<DeepReviewResult>;
}
