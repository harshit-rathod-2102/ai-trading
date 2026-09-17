import { AiAnalysisTier } from '../../../../ai-analysis/models/ai-analysis-tier.enum';
import { DeepReviewRecommendation } from '../../../../ai-analysis/models/deep-review-recommendation.enum';
import { DeepReviewResult } from '../../../../ai-analysis/models/deep-review-result.model';
import { TriageRiskLevel } from '../../../../ai-analysis/models/fast-triage-result.model';
import { JsonObject } from '../../../../common/types/json-value';
import { ProviderError, ProviderErrorCode } from '../../../provider-error';
import {
  OpenRouterChatResponseDto,
  OpenRouterChoiceDto,
  OpenRouterMessageDto,
  OpenRouterUsageDto,
} from '../dto/openrouter-response.dto';

const RESULT_FIELDS = new Set([
  'tier', 'overallRisk', 'eventRisk', 'uncertainty', 'confidence',
  'marketContextSummary', 'sectorContextSummary', 'newsSummary',
  'bullishFactors', 'bearishFactors', 'contradictions', 'redFlags',
  'missingEvidence', 'thesis', 'invalidationConcerns', 'recommendation',
  'recommendationReasons', 'summary',
]);

export interface DeepReviewMapperContext {
  readonly requestedModel: string;
  readonly promptVersion: string;
  readonly routingVersion: string;
  readonly analyzedAt: string;
  readonly structuredOutput: boolean;
}

export function mapOpenRouterDeepReview(
  response: OpenRouterChatResponseDto,
  context: DeepReviewMapperContext,
): DeepReviewResult {
  const responseRecord = record(response, 'response');
  const id = optionalString(responseRecord.id, 'response id');
  const resolvedModel = requiredString(responseRecord.model, 'resolved model', 200);
  const choices = responseRecord.choices;
  if (!Array.isArray(choices) || choices.length === 0) throw invalid('OpenRouter response has no choices');
  const choice = record(choices[0] as OpenRouterChoiceDto, 'first choice');
  if (choice.finish_reason !== undefined && choice.finish_reason !== null && choice.finish_reason !== 'stop') {
    throw invalid(`OpenRouter DEEP review did not finish normally: ${String(choice.finish_reason)}`);
  }
  const message = record(choice.message as OpenRouterMessageDto, 'assistant message');
  if (message.refusal !== undefined && message.refusal !== null && message.refusal !== '') {
    throw invalid('OpenRouter refused DEEP review');
  }
  const content = requiredString(message.content, 'assistant message content', 100_000);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw invalid('OpenRouter DEEP review content is not valid JSON');
  }
  const value = record(parsed, 'DEEP review');
  const extraField = Object.keys(value).find(key => !RESULT_FIELDS.has(key));
  if (extraField) throw invalid(`OpenRouter DEEP review has unexpected field: ${extraField}`);
  if (value.tier !== AiAnalysisTier.DEEP) throw invalid('OpenRouter DEEP review tier is invalid');

  return {
    tier: AiAnalysisTier.DEEP,
    overallRisk: risk(value.overallRisk, 'overallRisk'),
    eventRisk: risk(value.eventRisk, 'eventRisk'),
    uncertainty: risk(value.uncertainty, 'uncertainty'),
    confidence: confidenceString(value.confidence),
    marketContextSummary: requiredString(value.marketContextSummary, 'marketContextSummary', 3000),
    sectorContextSummary: requiredString(value.sectorContextSummary, 'sectorContextSummary', 3000),
    newsSummary: requiredString(value.newsSummary, 'newsSummary', 3000),
    bullishFactors: stringList(value.bullishFactors, 'bullishFactors', true),
    bearishFactors: stringList(value.bearishFactors, 'bearishFactors', true),
    contradictions: stringList(value.contradictions, 'contradictions'),
    redFlags: stringList(value.redFlags, 'redFlags'),
    missingEvidence: stringList(value.missingEvidence, 'missingEvidence'),
    thesis: requiredString(value.thesis, 'thesis', 3000),
    invalidationConcerns: stringList(value.invalidationConcerns, 'invalidationConcerns'),
    recommendation: recommendation(value.recommendation),
    recommendationReasons: stringList(value.recommendationReasons, 'recommendationReasons', true),
    summary: requiredString(value.summary, 'summary', 3000),
    modelMetadata: {
      analysisTier: AiAnalysisTier.DEEP,
      provider: 'openrouter',
      requestedModel: context.requestedModel,
      resolvedModel,
      requestId: id ?? undefined,
      promptVersion: context.promptVersion,
      routingVersion: context.routingVersion,
      analyzedAt: context.analyzedAt,
      usage: optionalUsage(responseRecord.usage),
      structuredOutput: context.structuredOutput,
    },
  };
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid(`OpenRouter ${field} is invalid`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') throw invalid(`OpenRouter ${field} is invalid`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum) throw invalid(`OpenRouter ${field} is invalid`);
  return trimmed;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw invalid(`OpenRouter ${field} is invalid`);
  return value.trim() || null;
}

function stringList(value: unknown, field: string, nonEmpty = false): readonly string[] {
  if (!Array.isArray(value) || value.length > 20 || (nonEmpty && value.length === 0)) {
    throw invalid(`OpenRouter ${field} is invalid`);
  }
  return value.map((item, index) => requiredString(item, `${field}[${index}]`, 800));
}

function risk(value: unknown, field: string): TriageRiskLevel {
  if (!Object.values(TriageRiskLevel).includes(value as TriageRiskLevel)) {
    throw invalid(`OpenRouter ${field} is invalid`);
  }
  return value as TriageRiskLevel;
}

function recommendation(value: unknown): DeepReviewRecommendation {
  if (!Object.values(DeepReviewRecommendation).includes(value as DeepReviewRecommendation)) {
    throw invalid('OpenRouter recommendation is invalid');
  }
  return value as DeepReviewRecommendation;
}

function confidenceString(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value.trim())) {
    throw invalid('OpenRouter confidence must be decimal text between 0 and 1');
  }
  return value.trim();
}

function optionalUsage(value: unknown): JsonObject | undefined {
  if (value === undefined || value === null) return undefined;
  const usage = record(value as OpenRouterUsageDto, 'usage');
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(usage)) {
    if (!Number.isInteger(raw) || Number(raw) < 0) throw invalid(`OpenRouter usage.${key} is invalid`);
    result[key] = Number(raw);
  }
  return result;
}

function invalid(message: string): ProviderError {
  return new ProviderError(message, {
    provider: 'openrouter',
    code: ProviderErrorCode.INVALID_RESPONSE,
    retryable: false,
  });
}
