import { JsonObject } from '../../../../common/types/json-value';
import { ProviderError, ProviderErrorCode } from '../../../provider-error';
import { AiRecommendation, RiskLevel } from '../../models/ai-analysis.enums';
import { CandidateAnalysisResult } from '../../models/candidate-analysis-result';
import {
  OpenRouterChatResponseDto,
  OpenRouterChoiceDto,
  OpenRouterMessageDto,
  OpenRouterUsageDto,
} from '../dto/openrouter-response.dto';
import { OpenRouterConfig } from '../openrouter.config';
import { CANDIDATE_ANALYSIS_PROMPT_VERSION } from '../prompts/candidate-analysis.prompt';

const RESULT_FIELDS = new Set([
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
]);

export function mapOpenRouterAnalysis(
  response: OpenRouterChatResponseDto,
  config: OpenRouterConfig,
  analyzedAt: string,
): CandidateAnalysisResult {
  const responseRecord = record(response, 'response');
  const id = optionalString(responseRecord.id, 'response id');
  const resolvedModel = requiredString(responseRecord.model, 'resolved model');
  const choices = responseRecord.choices;
  if (!Array.isArray(choices) || choices.length === 0)
    throw invalid('OpenRouter response has no choices');
  const choice = record(choices[0] as OpenRouterChoiceDto, 'first choice');
  if (
    choice.finish_reason !== undefined &&
    choice.finish_reason !== null &&
    choice.finish_reason !== 'stop'
  ) {
    throw invalid(`OpenRouter completion did not finish normally: ${String(choice.finish_reason)}`);
  }
  const message = record(choice.message as OpenRouterMessageDto, 'assistant message');
  if (message.refusal !== undefined && message.refusal !== null && message.refusal !== '') {
    throw invalid('OpenRouter refused candidate analysis');
  }
  const content = requiredString(message.content, 'assistant message content');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw invalid('OpenRouter assistant content is not valid JSON');
  }
  const value = record(parsed, 'candidate analysis');
  const extraFields = Object.keys(value).filter((key) => !RESULT_FIELDS.has(key));
  if (extraFields.length)
    throw invalid(`OpenRouter candidate analysis has unexpected field: ${extraFields[0]}`);
  const usage = optionalUsage(responseRecord.usage);

  return {
    overallRisk: risk(value.overallRisk, 'overallRisk'),
    eventRisk: risk(value.eventRisk, 'eventRisk'),
    confidence: confidence(value.confidence),
    bullishFactors: stringList(value.bullishFactors, 'bullishFactors'),
    bearishFactors: stringList(value.bearishFactors, 'bearishFactors'),
    contradictions: stringList(value.contradictions, 'contradictions'),
    marketContextSummary: requiredString(value.marketContextSummary, 'marketContextSummary'),
    sectorContextSummary: requiredString(value.sectorContextSummary, 'sectorContextSummary'),
    newsSummary: requiredString(value.newsSummary, 'newsSummary'),
    thesis: requiredString(value.thesis, 'thesis'),
    invalidationConcerns: stringList(value.invalidationConcerns, 'invalidationConcerns'),
    recommendation: recommendation(value.recommendation),
    summary: requiredString(value.summary, 'summary'),
    modelMetadata: {
      provider: 'openrouter',
      model: resolvedModel,
      requestId: id ?? undefined,
      promptVersion: CANDIDATE_ANALYSIS_PROMPT_VERSION,
      usage,
      metadata: {
        requestedModel: config.model,
        resolvedModel,
        analyzedAt,
      } as JsonObject,
    },
  };
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid(`OpenRouter ${field} is invalid`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw invalid(`OpenRouter ${field} is invalid`);
  return value.trim();
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw invalid(`OpenRouter ${field} is invalid`);
  return value.trim() || null;
}

function stringList(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length > 20) throw invalid(`OpenRouter ${field} is invalid`);
  return value.map((item, index) => requiredString(item, `${field}[${index}]`));
}

function risk(value: unknown, field: string): RiskLevel {
  if (!Object.values(RiskLevel).includes(value as RiskLevel))
    throw invalid(`OpenRouter ${field} is invalid`);
  return value as RiskLevel;
}

function recommendation(value: unknown): AiRecommendation {
  if (!Object.values(AiRecommendation).includes(value as AiRecommendation)) {
    throw invalid('OpenRouter recommendation is invalid');
  }
  return value as AiRecommendation;
}

function confidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw invalid('OpenRouter confidence must be between 0 and 1');
  }
  return value;
}

function optionalUsage(
  value: unknown,
): { inputTokens?: number; outputTokens?: number } | undefined {
  if (value === undefined || value === null) return undefined;
  const usage = record(value as OpenRouterUsageDto, 'usage');
  const inputTokens = optionalTokenCount(usage.prompt_tokens, 'prompt_tokens');
  const outputTokens = optionalTokenCount(usage.completion_tokens, 'completion_tokens');
  return inputTokens === undefined && outputTokens === undefined
    ? undefined
    : { inputTokens, outputTokens };
}

function optionalTokenCount(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || (value as number) < 0)
    throw invalid(`OpenRouter ${field} is invalid`);
  return value as number;
}

function invalid(message: string): ProviderError {
  return new ProviderError(message, {
    provider: 'openrouter',
    code: ProviderErrorCode.INVALID_RESPONSE,
    retryable: false,
  });
}
