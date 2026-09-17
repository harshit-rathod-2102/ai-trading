import { AiAnalysisTier } from '../../../../ai-analysis/models/ai-analysis-tier.enum';
import { DeepReviewRecommendation } from '../../../../ai-analysis/models/deep-review-recommendation.enum';
import { TriageRiskLevel } from '../../../../ai-analysis/models/fast-triage-result.model';

const text = { type: 'string', minLength: 1, maxLength: 3000 } as const;
const textList = {
  type: 'array',
  items: { type: 'string', minLength: 1, maxLength: 800 },
  maxItems: 20,
} as const;
const balancedTextList = { ...textList, minItems: 1 } as const;

export const CANDIDATE_DEEP_REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tier: { type: 'string', enum: [AiAnalysisTier.DEEP] },
    overallRisk: { type: 'string', enum: Object.values(TriageRiskLevel) },
    eventRisk: { type: 'string', enum: Object.values(TriageRiskLevel) },
    uncertainty: { type: 'string', enum: Object.values(TriageRiskLevel) },
    confidence: { type: 'string', pattern: '^(?:0(?:\\.\\d+)?|1(?:\\.0+)?)$' },
    marketContextSummary: text,
    sectorContextSummary: text,
    newsSummary: text,
    bullishFactors: balancedTextList,
    bearishFactors: balancedTextList,
    contradictions: textList,
    redFlags: textList,
    missingEvidence: textList,
    thesis: text,
    invalidationConcerns: textList,
    recommendation: { type: 'string', enum: Object.values(DeepReviewRecommendation) },
    recommendationReasons: balancedTextList,
    summary: text,
  },
  required: [
    'tier', 'overallRisk', 'eventRisk', 'uncertainty', 'confidence',
    'marketContextSummary', 'sectorContextSummary', 'newsSummary',
    'bullishFactors', 'bearishFactors', 'contradictions', 'redFlags',
    'missingEvidence', 'thesis', 'invalidationConcerns', 'recommendation',
    'recommendationReasons', 'summary',
  ],
} as const;
