import { AiRecommendation, RiskLevel } from '../../models/ai-analysis.enums';

const text = { type: 'string', minLength: 1, maxLength: 4000 } as const;
const textList = {
  type: 'array',
  items: { type: 'string', minLength: 1, maxLength: 1000 },
  maxItems: 20,
} as const;

export const CANDIDATE_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    overallRisk: { type: 'string', enum: Object.values(RiskLevel) },
    eventRisk: { type: 'string', enum: Object.values(RiskLevel) },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    bullishFactors: textList,
    bearishFactors: textList,
    contradictions: textList,
    marketContextSummary: text,
    sectorContextSummary: text,
    newsSummary: text,
    thesis: text,
    invalidationConcerns: textList,
    recommendation: { type: 'string', enum: Object.values(AiRecommendation) },
    summary: text,
  },
  required: [
    'overallRisk',
    'eventRisk',
    'confidence',
    'bullishFactors',
    'bearishFactors',
    'contradictions',
    'marketContextSummary',
    'sectorContextSummary',
    'newsSummary',
    'thesis',
    'invalidationConcerns',
    'recommendation',
    'summary',
  ],
} as const;
