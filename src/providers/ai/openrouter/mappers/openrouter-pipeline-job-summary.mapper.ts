import { ProviderError, ProviderErrorCode } from '../../../provider-error';
import { PipelineJobSummaryResult } from '../../models/pipeline-job-summary';
import { OpenRouterChatResponseDto } from '../dto/openrouter-response.dto';

export interface PipelineJobSummaryMapperContext {
  readonly requestedModel: string;
  readonly promptVersion: string;
}

export function mapOpenRouterPipelineJobSummary(
  response: OpenRouterChatResponseDto,
  context: PipelineJobSummaryMapperContext,
): PipelineJobSummaryResult {
  const value = record(response, 'response');
  const choices = value.choices;
  if (!Array.isArray(choices) || !choices.length)
    throw invalid('OpenRouter response has no choices');
  const choice = record(choices[0], 'first choice');
  if (
    choice.finish_reason !== undefined &&
    choice.finish_reason !== null &&
    choice.finish_reason !== 'stop'
  ) {
    throw invalid(`OpenRouter completion did not finish normally: ${String(choice.finish_reason)}`);
  }
  const message = record(choice.message, 'assistant message');
  if (message.refusal !== undefined && message.refusal !== null && message.refusal !== '') {
    throw invalid('OpenRouter refused pipeline job summarization');
  }
  const content = requiredString(message.content, 'assistant message content', 10_000);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw invalid('OpenRouter pipeline job summary is not valid JSON');
  }
  const summary = record(parsed, 'pipeline job summary');
  if (Object.keys(summary).some((key) => key !== 'summary')) {
    throw invalid('OpenRouter pipeline job summary has unexpected fields');
  }
  return {
    summary: requiredString(summary.summary, 'summary', 600),
    provider: 'openrouter',
    requestedModel: context.requestedModel,
    resolvedModel: requiredString(value.model, 'resolved model', 200),
    promptVersion: context.promptVersion,
    requestId: optionalString(value.id),
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

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function invalid(message: string): ProviderError {
  return new ProviderError(message, {
    provider: 'openrouter',
    code: ProviderErrorCode.INVALID_RESPONSE,
    retryable: false,
  });
}
