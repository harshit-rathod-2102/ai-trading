import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AI_PROVIDER } from '../providers/ai/ai-provider.token';
import { AiProvider } from '../providers/ai/ai-provider.interface';
import { CandidateAnalysisInput } from '../providers/ai/models/candidate-analysis-input';

@Injectable()
export class AiAnalysisService {
  constructor(@Inject(AI_PROVIDER) private readonly provider: AiProvider | null) {}

  analyzeCandidate(input: CandidateAnalysisInput) {
    if (!this.provider) throw new ServiceUnavailableException('No AI provider is configured');
    return this.provider.analyzeCandidate(input);
  }
}
