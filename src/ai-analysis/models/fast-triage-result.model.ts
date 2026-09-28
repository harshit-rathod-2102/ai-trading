import { JsonObject } from '../../common/types/json-value';
import { AiAnalysisTier } from './ai-analysis-tier.enum';

export enum TriageRiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export interface FastTriageInput {
  readonly symbol: string;
  readonly companyName: string;
  readonly strategy: string;
  readonly strategyVersion: string;
  readonly strategyScore: string;
  readonly rankingScore: string;
  readonly strategyRank: number;
  readonly globalRank: number;
  readonly marketRegime: JsonObject;
  readonly technicalSnapshot: JsonObject;
  readonly riskSnapshot: JsonObject;
  readonly newsSnapshot: JsonObject;
}

export interface FastTriageModelMetadata {
  readonly analysisTier: AiAnalysisTier.FAST;
  readonly provider: string;
  readonly requestedModel: string;
  readonly resolvedModel?: string;
  readonly requestId?: string;
  readonly promptVersion: string;
  /** Added by the application when the deterministic routing decision is made. */
  readonly routingVersion?: string;
  readonly analyzedAt: string;
  readonly usage?: JsonObject;
  readonly structuredOutput: boolean;
}

export interface FastTriageResult {
  readonly tier: AiAnalysisTier.FAST;
  readonly eventRisk: TriageRiskLevel;
  readonly uncertainty: TriageRiskLevel;
  /** Decimal text from 0 through 1, retained verbatim for auditability. */
  readonly confidence: string;
  readonly newsSummary: string;
  readonly bullishFactors: readonly string[];
  readonly bearishFactors: readonly string[];
  readonly contradictions: readonly string[];
  readonly missingEvidence: readonly string[];
  readonly redFlags: readonly string[];
  readonly requiresDeepReviewSuggested: boolean;
  readonly summary: string;
  readonly modelMetadata: FastTriageModelMetadata;
}
