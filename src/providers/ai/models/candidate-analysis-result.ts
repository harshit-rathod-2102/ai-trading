import { JsonObject } from '../../../common/types/json-value';
import { AiRecommendation, RiskLevel } from './ai-analysis.enums';

export interface AiModelMetadata {
  readonly provider: string;
  readonly model: string;
  readonly requestId?: string;
  readonly promptVersion?: string;
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
  };
  readonly metadata?: JsonObject;
}

export interface CandidateAnalysisResult {
  readonly overallRisk: RiskLevel;
  readonly eventRisk: RiskLevel;
  /** Provider-normalized confidence from 0 through 1. */
  readonly confidence: number;
  readonly bullishFactors: readonly string[];
  readonly bearishFactors: readonly string[];
  readonly contradictions: readonly string[];
  readonly marketContextSummary: string;
  readonly sectorContextSummary: string;
  readonly newsSummary: string;
  readonly thesis: string;
  readonly invalidationConcerns: readonly string[];
  readonly recommendation: AiRecommendation;
  readonly summary: string;
  readonly modelMetadata?: AiModelMetadata;
}
