import { AiAnalysisTier } from '../../../../ai-analysis/models/ai-analysis-tier.enum';
import { TriageRiskLevel } from '../../../../ai-analysis/models/fast-triage-result.model';

const text = { type: 'string', minLength: 1, maxLength: 1200 } as const;
const textList = {
  type: 'array',
  items: { type: 'string', minLength: 1, maxLength: 500 },
  maxItems: 12,
} as const;

export const CANDIDATE_FAST_TRIAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tier: { type: 'string', enum: [AiAnalysisTier.FAST] },
    eventRisk: { type: 'string', enum: Object.values(TriageRiskLevel) },
    uncertainty: { type: 'string', enum: Object.values(TriageRiskLevel) },
    confidence: { type: 'string', pattern: '^(?:0(?:\\.\\d+)?|1(?:\\.0+)?)$' },
    newsSummary: text,
    bullishFactors: textList,
    bearishFactors: textList,
    contradictions: textList,
    missingEvidence: textList,
    redFlags: textList,
    requiresDeepReviewSuggested: { type: 'boolean' },
    summary: text,
  },
  required: [
    'tier',
    'eventRisk',
    'uncertainty',
    'confidence',
    'newsSummary',
    'bullishFactors',
    'bearishFactors',
    'contradictions',
    'missingEvidence',
    'redFlags',
    'requiresDeepReviewSuggested',
    'summary',
  ],
} as const;
