import { AiAnalysisTier } from '../../../ai-analysis/models/ai-analysis-tier.enum';

export interface AiAnalysisOptions {
  readonly tier: AiAnalysisTier;
  readonly requestedModel?: string;
  readonly promptVersion: string;
  /** Evaluation-only consistency runs may bypass the bounded in-memory provider cache. */
  readonly bypassCache?: boolean;
}
