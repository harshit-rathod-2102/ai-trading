import { JsonObject } from '../../common/types/json-value';
import { AiAnalysisTier } from './ai-analysis-tier.enum';
import { AiRoutingDecision } from './ai-routing-decision.model';
import { DeepReviewRecommendation } from './deep-review-recommendation.enum';
import { FastTriageResult, TriageRiskLevel } from './fast-triage-result.model';

export interface DeepReviewInput {
  readonly symbol: string;
  readonly companyName: string;
  readonly sector: string | null;
  readonly strategy: string;
  readonly strategyVersion: string;
  readonly strategyScore: string;
  readonly rankingScore: string;
  readonly strategyRank: number;
  readonly globalRank: number;
  readonly technicalSnapshot: JsonObject;
  readonly marketRegimeSnapshot: JsonObject;
  readonly strategySnapshot: JsonObject;
  readonly rankingSnapshot: JsonObject;
  readonly riskSnapshot: JsonObject;
  readonly newsSnapshot: JsonObject;
  readonly fastAnalysis: FastTriageResult;
  readonly routingDecision: AiRoutingDecision;
}

export interface DeepReviewModelMetadata {
  readonly analysisTier: AiAnalysisTier.DEEP;
  readonly provider: string;
  readonly requestedModel: string;
  readonly resolvedModel?: string;
  readonly requestId?: string;
  readonly promptVersion: string;
  readonly routingVersion: string;
  readonly analyzedAt: string;
  readonly usage?: JsonObject;
  readonly structuredOutput: boolean;
  readonly fallbackReason?: string;
}

export interface DeepReviewResult {
  readonly tier: AiAnalysisTier.DEEP;
  readonly overallRisk: TriageRiskLevel;
  readonly eventRisk: TriageRiskLevel;
  readonly uncertainty: TriageRiskLevel;
  /** Decimal text from 0 through 1, retained verbatim for auditability. */
  readonly confidence: string;
  readonly marketContextSummary: string;
  readonly sectorContextSummary: string;
  readonly newsSummary: string;
  readonly bullishFactors: readonly string[];
  readonly bearishFactors: readonly string[];
  readonly contradictions: readonly string[];
  readonly redFlags: readonly string[];
  readonly missingEvidence: readonly string[];
  readonly thesis: string;
  readonly invalidationConcerns: readonly string[];
  readonly recommendation: DeepReviewRecommendation;
  readonly recommendationReasons: readonly string[];
  readonly summary: string;
  readonly modelMetadata: DeepReviewModelMetadata;
}
