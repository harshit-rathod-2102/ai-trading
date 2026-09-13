import { ProviderRequestContext } from '../provider-request-context';
import { CandidateAnalysisInput } from './models/candidate-analysis-input';
import { CandidateAnalysisResult } from './models/candidate-analysis-result';

export interface AiProvider {
  analyzeCandidate(
    input: CandidateAnalysisInput,
    context?: ProviderRequestContext,
  ): Promise<CandidateAnalysisResult>;
}
