import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiProvider } from '../ai-provider.interface';
import { CandidateAnalysisInput } from '../models/candidate-analysis-input';
import { CandidateAnalysisResult } from '../models/candidate-analysis-result';
import { ProviderError, ProviderErrorCode } from '../../provider-error';
import { ProviderRequestContext } from '../../provider-request-context';
import { OpenRouterClient, OpenRouterStructuredOutputUnsupportedError } from './openrouter-client';
import { OPENROUTER_CONFIG, OpenRouterConfig } from './openrouter.config';
import { mapOpenRouterAnalysis } from './mappers/openrouter-analysis.mapper';
import {
  CANDIDATE_ANALYSIS_PROMPT_VERSION,
  CANDIDATE_ANALYSIS_SYSTEM_PROMPT,
  candidateAnalysisUserPrompt,
} from './prompts/candidate-analysis.prompt';
import { CANDIDATE_ANALYSIS_SCHEMA } from './prompts/candidate-analysis.schema';
import { elapsedMilliseconds, structuredError } from '../../../logging/logging.utils';
import { AiAnalysisTier } from '../../../ai-analysis/models/ai-analysis-tier.enum';
import {
  FastTriageInput,
  FastTriageResult,
} from '../../../ai-analysis/models/fast-triage-result.model';
import { AiAnalysisOptions } from '../models/ai-analysis-options';
import { mapOpenRouterFastTriage } from './mappers/openrouter-fast-triage.mapper';
import {
  CANDIDATE_FAST_TRIAGE_PROMPT_VERSION,
  CANDIDATE_FAST_TRIAGE_SYSTEM_PROMPT,
  CANDIDATE_FAST_TRIAGE_TEMPERATURE,
  CANDIDATE_FAST_TRIAGE_MAX_OUTPUT_TOKENS,
  candidateFastTriageUserPrompt,
} from './prompts/candidate-fast-triage-v1';
import { CANDIDATE_FAST_TRIAGE_SCHEMA } from './prompts/candidate-fast-triage.schema';
import {
  DeepReviewInput,
  DeepReviewResult,
} from '../../../ai-analysis/models/deep-review-result.model';
import { mapOpenRouterDeepReview } from './mappers/openrouter-deep-review.mapper';
import {
  CANDIDATE_DEEP_REVIEW_MAX_OUTPUT_TOKENS,
  CANDIDATE_DEEP_REVIEW_PROMPT_VERSION,
  CANDIDATE_DEEP_REVIEW_SYSTEM_PROMPT,
  CANDIDATE_DEEP_REVIEW_TEMPERATURE,
  candidateDeepReviewUserPrompt,
} from './prompts/candidate-deep-review-v1';
import { CANDIDATE_DEEP_REVIEW_SCHEMA } from './prompts/candidate-deep-review.schema';

interface CachedAnalysis {
  readonly expiresAt: number;
  readonly result: CandidateAnalysisResult;
}

interface CachedFastTriage {
  readonly expiresAt: number;
  readonly result: FastTriageResult;
}

interface CachedDeepReview {
  readonly expiresAt: number;
  readonly result: DeepReviewResult;
}

@Injectable()
export class OpenRouterAiProvider implements AiProvider {
  private readonly logger = new Logger(OpenRouterAiProvider.name);
  private readonly cache = new Map<string, CachedAnalysis>();
  private readonly fastCache = new Map<string, CachedFastTriage>();
  private readonly deepCache = new Map<string, CachedDeepReview>();

  constructor(
    private readonly client: OpenRouterClient,
    @Inject(OPENROUTER_CONFIG) private readonly config: OpenRouterConfig,
  ) {}

  async analyzeCandidate(
    input: CandidateAnalysisInput,
    context?: ProviderRequestContext,
  ): Promise<CandidateAnalysisResult> {
    validateInput(input);
    const cacheKey = snapshotKey(input, this.config.model);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(
        {
          event: 'provider.cache.hit',
          module: OpenRouterAiProvider.name,
          provider: 'openrouter',
          operation: 'analyzeCandidate',
          symbol: input.symbol,
          strategyVersion: input.strategyVersion,
          requestedModel: this.config.model,
        },
        'OpenRouter analysis cache hit',
      );
      return cached.result;
    }
    if (cached) this.cache.delete(cacheKey);

    const startedAt = performance.now();
    const fields = {
      module: OpenRouterAiProvider.name,
      provider: 'openrouter',
      operation: 'analyzeCandidate',
      endpoint: '/chat/completions',
      symbol: input.symbol,
      strategy: input.strategy,
      strategyVersion: input.strategyVersion,
      promptVersion: CANDIDATE_ANALYSIS_PROMPT_VERSION,
      requestedModel: this.config.model,
      newsArticleCount: input.newsArticles.length,
    };
    this.logger.debug(
      { event: 'provider.request.started', ...fields },
      'OpenRouter analysis started',
    );

    try {
      let response;
      let structuredOutput = true;
      try {
        response = await this.client.createChatCompletion(this.request(input, true), context);
      } catch (error: unknown) {
        if (!(error instanceof OpenRouterStructuredOutputUnsupportedError)) throw error;
        structuredOutput = false;
        this.logger.warn(
          {
            event: 'provider.request.retrying',
            ...fields,
            attempt: 2,
            maxAttempts: 2,
            reason: 'structured_output_unsupported',
          },
          'OpenRouter analysis is retrying without structured output',
        );
        response = await this.client.createChatCompletion(this.request(input, false), context);
      }

      const result = mapOpenRouterAnalysis(response, this.config, new Date().toISOString());
      const enriched: CandidateAnalysisResult = {
        ...result,
        modelMetadata: result.modelMetadata
          ? {
              ...result.modelMetadata,
              metadata: { ...result.modelMetadata.metadata, structuredOutput },
            }
          : undefined,
      };
      this.remember(cacheKey, enriched);
      this.logger.debug(
        {
          event: 'provider.request.completed',
          ...fields,
          resolvedModel: enriched.modelMetadata?.model,
          recommendation: enriched.recommendation,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'completed',
        },
        'OpenRouter analysis completed',
      );
      return enriched;
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'provider.request.failed',
          ...fields,
          providerErrorCode: error instanceof ProviderError ? error.code : undefined,
          retryable: error instanceof ProviderError ? error.retryable : undefined,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'failed',
          ...structuredError(error),
        },
        'OpenRouter analysis failed',
      );
      throw error;
    }
  }

  async triageCandidate(
    input: FastTriageInput,
    options: AiAnalysisOptions,
    context?: ProviderRequestContext,
  ): Promise<FastTriageResult> {
    validateFastInput(input);
    if (
      options.tier !== AiAnalysisTier.FAST ||
      options.promptVersion !== CANDIDATE_FAST_TRIAGE_PROMPT_VERSION
    ) {
      throw rejected('OpenRouter FAST triage received unsupported tier or prompt version');
    }
    const requestedModel = options.requestedModel?.trim() || this.config.fastModel;
    const cacheKey = snapshotKey(
      { input, tier: options.tier },
      requestedModel,
      options.promptVersion,
    );
    const cached = this.fastCache.get(cacheKey);
    if (!options.bypassCache && cached && cached.expiresAt > Date.now()) {
      this.logger.debug(
        {
          event: 'provider.cache.hit',
          module: OpenRouterAiProvider.name,
          provider: 'openrouter',
          operation: 'triageCandidate',
          symbol: input.symbol,
          strategyVersion: input.strategyVersion,
          requestedModel,
        },
        'OpenRouter FAST triage cache hit',
      );
      return cached.result;
    }
    if (cached) this.fastCache.delete(cacheKey);

    const startedAt = performance.now();
    const fields = {
      module: OpenRouterAiProvider.name,
      provider: 'openrouter',
      operation: 'triageCandidate',
      endpoint: '/chat/completions',
      symbol: input.symbol,
      strategy: input.strategy,
      strategyVersion: input.strategyVersion,
      promptVersion: options.promptVersion,
      analysisTier: options.tier,
      requestedModel,
      newsArticleCount: articleCount(input.newsSnapshot),
    };
    this.logger.debug(
      { event: 'provider.request.started', ...fields },
      'OpenRouter FAST triage started',
    );

    try {
      let response;
      let structuredOutput = true;
      try {
        response = await this.client.createChatCompletion(
          this.fastRequest(input, requestedModel, true),
          context,
        );
      } catch (error: unknown) {
        if (!(error instanceof OpenRouterStructuredOutputUnsupportedError)) throw error;
        structuredOutput = false;
        this.logger.warn(
          {
            event: 'provider.request.retrying',
            ...fields,
            attempt: 2,
            maxAttempts: 2,
            reason: 'structured_output_unsupported',
          },
          'OpenRouter FAST triage is retrying without structured output',
        );
        response = await this.client.createChatCompletion(
          this.fastRequest(input, requestedModel, false),
          context,
        );
      }

      const result = mapOpenRouterFastTriage(response, {
        requestedModel,
        promptVersion: options.promptVersion,
        analyzedAt: new Date().toISOString(),
        structuredOutput,
      });
      if (!options.bypassCache) this.rememberFast(cacheKey, result);
      this.logger.debug(
        {
          event: 'provider.request.completed',
          ...fields,
          resolvedModel: result.modelMetadata.resolvedModel,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'completed',
        },
        'OpenRouter FAST triage completed',
      );
      return result;
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'provider.request.failed',
          ...fields,
          providerErrorCode: error instanceof ProviderError ? error.code : undefined,
          retryable: error instanceof ProviderError ? error.retryable : undefined,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'failed',
          ...structuredError(error),
        },
        'OpenRouter FAST triage failed',
      );
      throw error;
    }
  }

  async reviewCandidate(
    input: DeepReviewInput,
    options: AiAnalysisOptions,
    context?: ProviderRequestContext,
  ): Promise<DeepReviewResult> {
    validateDeepInput(input);
    if (
      options.tier !== AiAnalysisTier.DEEP ||
      options.promptVersion !== CANDIDATE_DEEP_REVIEW_PROMPT_VERSION
    ) {
      throw rejected('OpenRouter DEEP review received unsupported tier or prompt version');
    }
    if (options.requestedModel?.trim() && options.requestedModel.trim() !== this.config.deepModel) {
      throw rejected('OpenRouter DEEP review model must match OPENROUTER_DEEP_MODEL');
    }
    const requestedModel = this.config.deepModel;
    const cacheKey = snapshotKey(
      { input, tier: options.tier },
      requestedModel,
      options.promptVersion,
    );
    const cached = this.deepCache.get(cacheKey);
    if (!options.bypassCache && cached && cached.expiresAt > Date.now()) {
      this.logger.debug(
        {
          event: 'provider.cache.hit',
          module: OpenRouterAiProvider.name,
          provider: 'openrouter',
          operation: 'reviewCandidate',
          symbol: input.symbol,
          strategyVersion: input.strategyVersion,
          requestedModel,
        },
        'OpenRouter DEEP review cache hit',
      );
      return cached.result;
    }
    if (cached) this.deepCache.delete(cacheKey);

    const startedAt = performance.now();
    const fields = {
      module: OpenRouterAiProvider.name,
      provider: 'openrouter',
      operation: 'reviewCandidate',
      endpoint: '/chat/completions',
      symbol: input.symbol,
      strategy: input.strategy,
      strategyVersion: input.strategyVersion,
      promptVersion: options.promptVersion,
      analysisTier: options.tier,
      requestedModel,
      routingVersion: input.routingDecision.version,
      routingReasons: input.routingDecision.reasons,
      newsArticleCount: articleCount(input.newsSnapshot),
    };
    this.logger.debug(
      { event: 'provider.request.started', ...fields },
      'OpenRouter DEEP review started',
    );

    try {
      let response;
      let structuredOutput = true;
      try {
        response = await this.client.createChatCompletion(
          this.deepRequest(input, requestedModel, true),
          context,
        );
      } catch (error: unknown) {
        if (!(error instanceof OpenRouterStructuredOutputUnsupportedError)) throw error;
        structuredOutput = false;
        this.logger.warn(
          {
            event: 'provider.request.retrying',
            ...fields,
            attempt: 2,
            maxAttempts: 2,
            reason: 'structured_output_unsupported',
          },
          'OpenRouter DEEP review is retrying without structured output',
        );
        response = await this.client.createChatCompletion(
          this.deepRequest(input, requestedModel, false),
          context,
        );
      }

      const result = mapOpenRouterDeepReview(response, {
        requestedModel,
        promptVersion: options.promptVersion,
        routingVersion: input.routingDecision.version,
        analyzedAt: new Date().toISOString(),
        structuredOutput,
      });
      if (!options.bypassCache) this.rememberDeep(cacheKey, result);
      this.logger.debug(
        {
          event: 'provider.request.completed',
          ...fields,
          resolvedModel: result.modelMetadata.resolvedModel,
          recommendation: result.recommendation,
          overallRisk: result.overallRisk,
          eventRisk: result.eventRisk,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'completed',
        },
        'OpenRouter DEEP review completed',
      );
      return result;
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'provider.request.failed',
          ...fields,
          providerErrorCode: error instanceof ProviderError ? error.code : undefined,
          retryable: error instanceof ProviderError ? error.retryable : undefined,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'failed',
          ...structuredError(error),
        },
        'OpenRouter DEEP review failed',
      );
      throw error;
    }
  }

  private request(
    input: CandidateAnalysisInput,
    structured: boolean,
  ): Readonly<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      stream: false,
      temperature: 0,
      messages: [
        { role: 'system', content: CANDIDATE_ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: candidateAnalysisUserPrompt(input, !structured) },
      ],
    };
    if (structured) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'candidate_analysis',
          strict: true,
          schema: CANDIDATE_ANALYSIS_SCHEMA,
        },
      };
      body.provider = { require_parameters: true };
    }
    return body;
  }

  private fastRequest(
    input: FastTriageInput,
    requestedModel: string,
    structured: boolean,
  ): Readonly<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      model: requestedModel,
      stream: false,
      temperature: CANDIDATE_FAST_TRIAGE_TEMPERATURE,
      max_tokens: CANDIDATE_FAST_TRIAGE_MAX_OUTPUT_TOKENS,
      messages: [
        { role: 'system', content: CANDIDATE_FAST_TRIAGE_SYSTEM_PROMPT },
        { role: 'user', content: candidateFastTriageUserPrompt(input, !structured) },
      ],
    };
    if (structured) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'candidate_fast_triage',
          strict: true,
          schema: CANDIDATE_FAST_TRIAGE_SCHEMA,
        },
      };
      body.provider = { require_parameters: true };
    }
    return body;
  }

  private deepRequest(
    input: DeepReviewInput,
    requestedModel: string,
    structured: boolean,
  ): Readonly<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      model: requestedModel,
      stream: false,
      temperature: CANDIDATE_DEEP_REVIEW_TEMPERATURE,
      max_tokens: CANDIDATE_DEEP_REVIEW_MAX_OUTPUT_TOKENS,
      messages: [
        { role: 'system', content: CANDIDATE_DEEP_REVIEW_SYSTEM_PROMPT },
        { role: 'user', content: candidateDeepReviewUserPrompt(input, !structured) },
      ],
    };
    if (structured) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'candidate_deep_review',
          strict: true,
          schema: CANDIDATE_DEEP_REVIEW_SCHEMA,
        },
      };
      body.provider = { require_parameters: true };
    }
    return body;
  }

  private remember(key: string, result: CandidateAnalysisResult): void {
    if (this.cache.size >= 100) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { expiresAt: Date.now() + this.config.cacheTtlMs, result });
  }

  private rememberFast(key: string, result: FastTriageResult): void {
    if (this.fastCache.size >= 100) {
      const oldest = this.fastCache.keys().next().value as string | undefined;
      if (oldest) this.fastCache.delete(oldest);
    }
    this.fastCache.set(key, { expiresAt: Date.now() + this.config.cacheTtlMs, result });
  }

  private rememberDeep(key: string, result: DeepReviewResult): void {
    if (this.deepCache.size >= 100) {
      const oldest = this.deepCache.keys().next().value as string | undefined;
      if (oldest) this.deepCache.delete(oldest);
    }
    this.deepCache.set(key, { expiresAt: Date.now() + this.config.cacheTtlMs, result });
  }
}

function validateInput(input: CandidateAnalysisInput): void {
  if (!input || typeof input !== 'object') throw rejected('Candidate analysis input is required');
  if (!input.symbol?.trim()) throw rejected('Candidate symbol is required');
  if (!input.strategy?.trim()) throw rejected('Candidate strategy is required');
  if (!input.strategyVersion?.trim()) throw rejected('Candidate strategy version is required');
  if (!Number.isFinite(input.quantScore) || input.quantScore < 0 || input.quantScore > 100) {
    throw rejected('Candidate quant score must be between 0 and 100');
  }
  for (const [name, value] of [
    ['technicalSnapshot', input.technicalSnapshot],
    ['riskSnapshot', input.riskSnapshot],
    ['marketContext', input.marketContext],
    ['sectorContext', input.sectorContext],
  ] as const) {
    if (!isRecord(value)) throw rejected(`Candidate ${name} must be an object`);
  }
  if (!Array.isArray(input.newsArticles)) throw rejected('Candidate newsArticles must be an array');
}

function validateFastInput(input: FastTriageInput): void {
  if (!input || typeof input !== 'object') throw rejected('FAST triage input is required');
  for (const [name, value] of [
    ['symbol', input.symbol],
    ['companyName', input.companyName],
    ['strategy', input.strategy],
    ['strategyVersion', input.strategyVersion],
    ['strategyScore', input.strategyScore],
    ['rankingScore', input.rankingScore],
  ] as const) {
    if (typeof value !== 'string' || !value.trim())
      throw rejected(`FAST triage ${name} is required`);
  }
  if (
    !Number.isInteger(input.strategyRank) ||
    input.strategyRank < 1 ||
    !Number.isInteger(input.globalRank) ||
    input.globalRank < 1
  ) {
    throw rejected('FAST triage ranks must be positive integers');
  }
  for (const [name, value] of [
    ['marketRegime', input.marketRegime],
    ['technicalSnapshot', input.technicalSnapshot],
    ['riskSnapshot', input.riskSnapshot],
    ['newsSnapshot', input.newsSnapshot],
  ] as const) {
    if (!isRecord(value)) throw rejected(`FAST triage ${name} must be an object`);
  }
}

function validateDeepInput(input: DeepReviewInput): void {
  if (!input || typeof input !== 'object') throw rejected('DEEP review input is required');
  for (const [name, value] of [
    ['symbol', input.symbol],
    ['companyName', input.companyName],
    ['strategy', input.strategy],
    ['strategyVersion', input.strategyVersion],
    ['strategyScore', input.strategyScore],
    ['rankingScore', input.rankingScore],
  ] as const) {
    if (typeof value !== 'string' || !value.trim())
      throw rejected(`DEEP review ${name} is required`);
  }
  if (
    !Number.isInteger(input.strategyRank) ||
    input.strategyRank < 1 ||
    !Number.isInteger(input.globalRank) ||
    input.globalRank < 1
  ) {
    throw rejected('DEEP review ranks must be positive integers');
  }
  for (const [name, value] of [
    ['technicalSnapshot', input.technicalSnapshot],
    ['marketRegimeSnapshot', input.marketRegimeSnapshot],
    ['strategySnapshot', input.strategySnapshot],
    ['rankingSnapshot', input.rankingSnapshot],
    ['riskSnapshot', input.riskSnapshot],
    ['newsSnapshot', input.newsSnapshot],
    ['fastAnalysis', input.fastAnalysis],
    ['routingDecision', input.routingDecision],
  ] as const) {
    if (!isRecord(value)) throw rejected(`DEEP review ${name} must be an object`);
  }
  if (
    input.fastAnalysis.tier !== AiAnalysisTier.FAST ||
    input.routingDecision.escalate !== true ||
    input.routingDecision.tierSelected !== AiAnalysisTier.DEEP
  ) {
    throw rejected('DEEP review requires an escalated FAST routing decision');
  }
}

function snapshotKey(
  input: unknown,
  model: string,
  promptVersion = CANDIDATE_ANALYSIS_PROMPT_VERSION,
): string {
  const serialized = stableStringify({ input, model, promptVersion });
  return createHash('sha256').update(serialized).digest('hex');
}

function articleCount(snapshot: Record<string, unknown>): number {
  return Array.isArray(snapshot.articles) ? snapshot.articles.length : 0;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejected(message: string): ProviderError {
  return new ProviderError(message, {
    provider: 'openrouter',
    code: ProviderErrorCode.REQUEST_REJECTED,
    retryable: false,
  });
}
