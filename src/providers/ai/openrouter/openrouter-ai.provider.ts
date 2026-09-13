import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiProvider } from '../ai-provider.interface';
import { CandidateAnalysisInput } from '../models/candidate-analysis-input';
import { CandidateAnalysisResult } from '../models/candidate-analysis-result';
import { ProviderError, ProviderErrorCode } from '../../provider-error';
import { ProviderRequestContext } from '../../provider-request-context';
import {
  OpenRouterClient,
  OpenRouterStructuredOutputUnsupportedError,
} from './openrouter-client';
import { OPENROUTER_CONFIG, OpenRouterConfig } from './openrouter.config';
import { mapOpenRouterAnalysis } from './mappers/openrouter-analysis.mapper';
import {
  CANDIDATE_ANALYSIS_PROMPT_VERSION,
  CANDIDATE_ANALYSIS_SYSTEM_PROMPT,
  candidateAnalysisUserPrompt,
} from './prompts/candidate-analysis.prompt';
import { CANDIDATE_ANALYSIS_SCHEMA } from './prompts/candidate-analysis.schema';

interface CachedAnalysis {
  readonly expiresAt: number;
  readonly result: CandidateAnalysisResult;
}

@Injectable()
export class OpenRouterAiProvider implements AiProvider {
  private readonly logger = new Logger(OpenRouterAiProvider.name);
  private readonly cache = new Map<string, CachedAnalysis>();

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
      this.logger.log(`OpenRouter analysis cache hit: ${input.symbol}, ${input.strategyVersion}`);
      return cached.result;
    }
    if (cached) this.cache.delete(cacheKey);

    this.logger.log(
      `OpenRouter candidate analysis: ${input.symbol}, ${input.strategyVersion}, prompt ${CANDIDATE_ANALYSIS_PROMPT_VERSION}, ${input.newsArticles.length} news article(s)`,
    );

    let response;
    let structuredOutput = true;
    try {
      response = await this.client.createChatCompletion(this.request(input, true), context);
    } catch (error: unknown) {
      if (!(error instanceof OpenRouterStructuredOutputUnsupportedError)) throw error;
      structuredOutput = false;
      this.logger.warn('Selected OpenRouter model does not support structured output; using one JSON-only fallback request');
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
    this.logger.log(
      `OpenRouter analysis completed: ${input.symbol}, ${enriched.recommendation}, model ${enriched.modelMetadata?.model}`,
    );
    return enriched;
  }

  private request(input: CandidateAnalysisInput, structured: boolean): Readonly<Record<string, unknown>> {
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

  private remember(key: string, result: CandidateAnalysisResult): void {
    if (this.cache.size >= 100) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { expiresAt: Date.now() + this.config.cacheTtlMs, result });
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

function snapshotKey(input: CandidateAnalysisInput, model: string): string {
  const serialized = stableStringify({ input, model, promptVersion: CANDIDATE_ANALYSIS_PROMPT_VERSION });
  return createHash('sha256').update(serialized).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
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
