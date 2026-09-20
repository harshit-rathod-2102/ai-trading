import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CandidateStatus } from '../common/enums/candidate-status.enum';
import { TradeCandidate } from '../candidates/entities/trade-candidate.entity';
import { Instrument } from '../instruments/entities/instrument.entity';
import { elapsedMilliseconds, structuredError } from '../logging/logging.utils';
import { AiProvider } from '../providers/ai/ai-provider.interface';
import { AI_PROVIDER } from '../providers/ai/ai-provider.token';
import { CANDIDATE_DEEP_REVIEW_PROMPT_VERSION } from '../providers/ai/openrouter/prompts/candidate-deep-review-v1';
import { CANDIDATE_FAST_TRIAGE_PROMPT_VERSION } from '../providers/ai/openrouter/prompts/candidate-fast-triage-v1';
import { ProviderError, ProviderErrorCode } from '../providers/provider-error';
import { deepEvidenceHash, fastEvidenceHash } from './ai-evidence-hash';
import { AiAnalysisTier } from './models/ai-analysis-tier.enum';
import { AiRoutingDecision } from './models/ai-routing-decision.model';
import {
  DeepReviewErrorCode,
  DeepReviewExecutionResult,
} from './models/deep-review-execution-result.model';
import { DeepReviewInput, DeepReviewResult } from './models/deep-review-result.model';
import { FastTriageResult } from './models/fast-triage-result.model';
import { AI_ROUTING_V1_CONFIG } from './config/ai-routing-v1.config';
import { buildDeepReviewInput, validNewsSnapshot } from './ai-evidence-builder';

enum DeepReviewEligibilityCode {
  CANDIDATE_NOT_FOUND = 'CANDIDATE_NOT_FOUND',
  CANDIDATE_NOT_PRE_FINAL = 'CANDIDATE_NOT_PRE_FINAL',
  MISSING_DEEP_REVIEW_EVIDENCE = 'MISSING_DEEP_REVIEW_EVIDENCE',
  DEEP_REVIEW_NOT_ESCALATED = 'DEEP_REVIEW_NOT_ESCALATED',
}

interface DeepReviewContext {
  readonly candidate: TradeCandidate;
  readonly instrument: Instrument;
  readonly fastAnalysis: FastTriageResult;
  readonly routingDecision: AiRoutingDecision;
  readonly input: DeepReviewInput;
  readonly evidenceHash: string;
  readonly requestedModel: string;
}

@Injectable()
export class DeepAiReviewService {
  private readonly logger = new Logger(DeepAiReviewService.name);
  private readonly inFlight = new Map<string, Promise<DeepReviewExecutionResult>>();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TradeCandidate)
    private readonly candidates: Repository<TradeCandidate>,
    @InjectRepository(Instrument)
    private readonly instruments: Repository<Instrument>,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider | null,
    private readonly config: ConfigService,
  ) {}

  reviewCandidate(candidateId: string): Promise<DeepReviewExecutionResult> {
    const existing = this.inFlight.get(candidateId);
    if (existing) return existing;
    const execution = this.execute(candidateId).finally(() => {
      if (this.inFlight.get(candidateId) === execution) this.inFlight.delete(candidateId);
    });
    this.inFlight.set(candidateId, execution);
    return execution;
  }

  async analyzeEvidence(
    input: DeepReviewInput,
    bypassProviderCache = false,
  ): Promise<DeepReviewResult> {
    if (!this.provider) throw new Error('No AI provider is configured');
    return this.provider.reviewCandidate(input, {
      tier: AiAnalysisTier.DEEP,
      requestedModel: this.config.getOrThrow<string>('openrouter.deepModel'),
      promptVersion: CANDIDATE_DEEP_REVIEW_PROMPT_VERSION,
      bypassCache: bypassProviderCache,
    });
  }

  private async execute(candidateId: string): Promise<DeepReviewExecutionResult> {
    const startedAt = performance.now();
    let context: DeepReviewContext | undefined;
    try {
      context = await this.loadContext(candidateId);
      const fields = this.logContext(context);
      this.logger.log({ event: 'ai.deep.started', ...fields }, 'Candidate DEEP AI review started');

      const reused = storedDeepReview(
        context.candidate.aiAnalysis,
        context.evidenceHash,
        context.requestedModel,
      );
      if (reused) {
        this.logger.log(
          {
            event: 'ai.deep.reused',
            ...fields,
            resolvedModel: reused.modelMetadata.resolvedModel,
            recommendation: reused.recommendation,
            overallRisk: reused.overallRisk,
            eventRisk: reused.eventRisk,
            durationMs: elapsedMilliseconds(startedAt),
            status: 'reused',
          },
          'Existing candidate DEEP AI review reused',
        );
        return this.success(context, reused, true);
      }

      if (!this.provider) {
        return this.failure(
          context,
          startedAt,
          DeepReviewErrorCode.PROVIDER_NOT_CONFIGURED,
          false,
          'No AI provider is configured; set AI_PROVIDER before retrying.',
        );
      }

      let analysis: DeepReviewResult;
      try {
        analysis = await this.analyzeEvidence(context.input);
      } catch (error: unknown) {
        const failure = providerFailure(error);
        return this.failure(
          context,
          startedAt,
          failure.code,
          failure.retryable,
          failure.warning,
          error,
        );
      }

      const persisted = await this.persist(context, analysis);
      if (!persisted) {
        return this.failure(
          context,
          startedAt,
          DeepReviewErrorCode.EVIDENCE_CHANGED,
          true,
          'Candidate evidence changed during DEEP review; rerun FAST triage before retrying.',
        );
      }
      this.logger.log(
        {
          event: 'ai.deep.completed',
          ...fields,
          resolvedModel: analysis.modelMetadata.resolvedModel,
          recommendation: analysis.recommendation,
          overallRisk: analysis.overallRisk,
          eventRisk: analysis.eventRisk,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'completed',
        },
        'Candidate DEEP AI review completed',
      );
      return this.success(context, analysis, false);
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'ai.deep.failed',
          module: DeepAiReviewService.name,
          operation: 'reviewCandidate',
          candidateId,
          ...(context
            ? {
                symbol: context.candidate.symbol,
                strategy: context.candidate.strategy,
                routingReasons: context.routingDecision.reasons,
                requestedModel: context.requestedModel,
                evidenceHash: context.evidenceHash,
              }
            : {}),
          promptVersion: CANDIDATE_DEEP_REVIEW_PROMPT_VERSION,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'failed',
          ...structuredError(error),
        },
        'Candidate DEEP AI review failed',
      );
      throw error;
    }
  }

  private async loadContext(candidateId: string): Promise<DeepReviewContext> {
    const candidate = await this.candidates.findOneBy({ id: candidateId });
    if (!candidate) {
      throw new NotFoundException({
        code: DeepReviewEligibilityCode.CANDIDATE_NOT_FOUND,
        message: 'Trade candidate was not found',
        candidateId,
      });
    }
    this.ensureBaseEvidence(candidate);
    const instrument = await this.instruments.findOneBy({
      symbol: candidate.symbol,
      exchange: candidate.exchange,
    });
    if (!instrument?.name?.trim()) {
      this.ineligible(
        candidate,
        DeepReviewEligibilityCode.MISSING_DEEP_REVIEW_EVIDENCE,
        'Candidate instrument company metadata is required for DEEP review',
      );
    }
    const persisted = persistedFastAndRouting(candidate.aiAnalysis);
    if (!persisted) {
      this.ineligible(
        candidate,
        DeepReviewEligibilityCode.MISSING_DEEP_REVIEW_EVIDENCE,
        'Completed FAST analysis and routing evidence are required before DEEP review',
      );
    }
    if (
      !persisted.routingDecision.escalate ||
      persisted.routingDecision.tierSelected !== AiAnalysisTier.DEEP
    ) {
      this.ineligible(
        candidate,
        DeepReviewEligibilityCode.DEEP_REVIEW_NOT_ESCALATED,
        'DEEP review is allowed only when deterministic routing selected DEEP',
      );
    }
    if (persisted.routingDecision.reasons.length === 0) {
      this.ineligible(
        candidate,
        DeepReviewEligibilityCode.MISSING_DEEP_REVIEW_EVIDENCE,
        'Escalated routing must retain at least one typed escalation reason',
      );
    }
    const currentFastHash = fastEvidenceHash(
      candidate,
      instrument.name,
      CANDIDATE_FAST_TRIAGE_PROMPT_VERSION,
    );
    if (persisted.fastEvidenceHash !== currentFastHash) {
      this.ineligible(
        candidate,
        DeepReviewEligibilityCode.MISSING_DEEP_REVIEW_EVIDENCE,
        'Candidate evidence changed after FAST routing; rerun FAST triage before DEEP review',
      );
    }
    const requestedModel = this.config.getOrThrow<string>('openrouter.deepModel');
    const input = buildDeepReviewInput(
      candidate,
      instrument.name,
      persisted.fastAnalysis,
      persisted.routingDecision,
    );
    return {
      candidate,
      instrument,
      fastAnalysis: persisted.fastAnalysis,
      routingDecision: persisted.routingDecision,
      input,
      requestedModel,
      evidenceHash: deepEvidenceHash(
        candidate,
        instrument.name,
        persisted.fastAnalysis,
        persisted.routingDecision,
        CANDIDATE_DEEP_REVIEW_PROMPT_VERSION,
      ),
    };
  }

  private ensureBaseEvidence(candidate: TradeCandidate): void {
    if (candidate.status !== CandidateStatus.NEW) {
      this.ineligible(
        candidate,
        DeepReviewEligibilityCode.CANDIDATE_NOT_PRE_FINAL,
        'DEEP review requires a candidate in NEW status',
      );
    }
    if (
      !candidate.scanResultId ||
      !candidate.strategy?.trim() ||
      !candidate.strategyVersion?.trim() ||
      !isScore(candidate.strategyScore) ||
      !isScore(candidate.rankingScore) ||
      !isPositiveRank(candidate.strategyRank) ||
      !isPositiveRank(candidate.globalRank) ||
      !isNonEmptyRecord(candidate.technicalSnapshot) ||
      !isNonEmptyRecord(candidate.riskSnapshot) ||
      !isNonEmptyRecord(candidate.marketRegimeSnapshot) ||
      !isNonEmptyRecord(candidate.strategySnapshot) ||
      !isNonEmptyRecord(candidate.rankingSnapshot) ||
      !candidate.newsEnrichedAt ||
      !validNewsSnapshot(candidate.newsSnapshot)
    ) {
      this.ineligible(
        candidate,
        DeepReviewEligibilityCode.MISSING_DEEP_REVIEW_EVIDENCE,
        'Candidate is missing persisted technical, regime, strategy, ranking, risk, or news evidence',
      );
    }
  }

  private async persist(context: DeepReviewContext, analysis: DeepReviewResult): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(TradeCandidate);
      const candidate = await repository.findOne({
        where: { id: context.candidate.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!candidate) return false;
      this.ensureBaseEvidence(candidate);
      const instrument = await manager.getRepository(Instrument).findOneBy({
        symbol: candidate.symbol,
        exchange: candidate.exchange,
      });
      if (!instrument) return false;
      const persisted = persistedFastAndRouting(candidate.aiAnalysis);
      if (
        !persisted ||
        !persisted.routingDecision.escalate ||
        persisted.routingDecision.tierSelected !== AiAnalysisTier.DEEP ||
        persisted.fastEvidenceHash !==
          fastEvidenceHash(candidate, instrument.name, CANDIDATE_FAST_TRIAGE_PROMPT_VERSION)
      )
        return false;
      const currentHash = deepEvidenceHash(
        candidate,
        instrument.name,
        persisted.fastAnalysis,
        persisted.routingDecision,
        CANDIDATE_DEEP_REVIEW_PROMPT_VERSION,
      );
      if (currentHash !== context.evidenceHash) return false;
      const alreadyStored = storedDeepReview(
        candidate.aiAnalysis,
        currentHash,
        context.requestedModel,
      );
      if (alreadyStored) return true;

      const existing = isRecord(candidate.aiAnalysis) ? candidate.aiAnalysis : {};
      candidate.aiAnalysis = jsonObject({
        ...existing,
        deep: { ...analysis, evidenceHash: context.evidenceHash },
      });
      await repository.save(candidate);
      return true;
    });
  }

  private success(
    context: DeepReviewContext,
    deepAnalysis: DeepReviewResult,
    reusedExistingAnalysis: boolean,
  ): DeepReviewExecutionResult {
    return {
      candidateId: context.candidate.id,
      success: true,
      reusedExistingAnalysis,
      evidenceHash: context.evidenceHash,
      deepAnalysis,
      warnings: [],
    };
  }

  private failure(
    context: DeepReviewContext,
    startedAt: number,
    errorCode: DeepReviewErrorCode,
    retryable: boolean,
    warning: string,
    error?: unknown,
  ): DeepReviewExecutionResult {
    this.logger.error(
      {
        event: 'ai.deep.failed',
        ...this.logContext(context),
        errorCode,
        retryable,
        durationMs: elapsedMilliseconds(startedAt),
        status: 'failed',
        ...(error ? structuredError(error) : {}),
      },
      'Candidate DEEP AI review failed',
    );
    return {
      candidateId: context.candidate.id,
      success: false,
      reusedExistingAnalysis: false,
      evidenceHash: context.evidenceHash,
      warnings: [warning],
      errorCode,
      retryable,
    };
  }

  private logContext(context: DeepReviewContext): Record<string, unknown> {
    return {
      module: DeepAiReviewService.name,
      operation: 'reviewCandidate',
      candidateId: context.candidate.id,
      symbol: context.candidate.symbol,
      strategy: context.candidate.strategy,
      routingReasons: context.routingDecision.reasons,
      requestedModel: context.requestedModel,
      promptVersion: CANDIDATE_DEEP_REVIEW_PROMPT_VERSION,
      evidenceHash: context.evidenceHash,
    };
  }

  private ineligible(
    candidate: TradeCandidate,
    code: DeepReviewEligibilityCode,
    message: string,
  ): never {
    throw new UnprocessableEntityException({ code, message, candidateId: candidate.id });
  }
}

function persistedFastAndRouting(value: Record<string, unknown> | null): {
  readonly fastAnalysis: FastTriageResult;
  readonly fastEvidenceHash: string;
  readonly routingDecision: AiRoutingDecision;
} | null {
  if (
    !isRecord(value) ||
    !isRecord(value.fast) ||
    !isRecord(value.routing) ||
    value.fast.tier !== AiAnalysisTier.FAST ||
    typeof value.fast.evidenceHash !== 'string' ||
    !isRecord(value.fast.modelMetadata) ||
    !Array.isArray(value.fast.bullishFactors) ||
    !Array.isArray(value.fast.bearishFactors) ||
    !Array.isArray(value.fast.contradictions) ||
    !Array.isArray(value.fast.missingEvidence) ||
    !Array.isArray(value.fast.redFlags) ||
    typeof value.fast.requiresDeepReviewSuggested !== 'boolean' ||
    value.fast.modelMetadata.promptVersion !== CANDIDATE_FAST_TRIAGE_PROMPT_VERSION ||
    value.fast.modelMetadata.routingVersion !== AI_ROUTING_V1_CONFIG.version ||
    value.routing.version !== AI_ROUTING_V1_CONFIG.version ||
    typeof value.routing.escalate !== 'boolean' ||
    !Array.isArray(value.routing.reasons) ||
    typeof value.routing.tierSelected !== 'string'
  )
    return null;
  if (!value.routing.reasons.every((reason) => typeof reason === 'string' && reason.trim()))
    return null;
  const { evidenceHash, ...fast } = value.fast;
  return {
    fastAnalysis: fast as unknown as FastTriageResult,
    fastEvidenceHash: evidenceHash,
    routingDecision: value.routing as unknown as AiRoutingDecision,
  };
}

function storedDeepReview(
  value: Record<string, unknown> | null,
  hash: string,
  requestedModel: string,
): DeepReviewResult | null {
  if (
    !isRecord(value) ||
    !isRecord(value.deep) ||
    value.deep.tier !== AiAnalysisTier.DEEP ||
    value.deep.evidenceHash !== hash ||
    !isRecord(value.deep.modelMetadata) ||
    value.deep.modelMetadata.requestedModel !== requestedModel ||
    value.deep.modelMetadata.promptVersion !== CANDIDATE_DEEP_REVIEW_PROMPT_VERSION ||
    value.deep.modelMetadata.routingVersion !== AI_ROUTING_V1_CONFIG.version ||
    !Array.isArray(value.deep.bullishFactors) ||
    !Array.isArray(value.deep.bearishFactors) ||
    !Array.isArray(value.deep.contradictions) ||
    !Array.isArray(value.deep.missingEvidence) ||
    !Array.isArray(value.deep.invalidationConcerns) ||
    !Array.isArray(value.deep.recommendationReasons)
  )
    return null;
  const { evidenceHash: _evidenceHash, ...deep } = value.deep;
  return deep as unknown as DeepReviewResult;
}

function providerFailure(error: unknown): {
  readonly code: DeepReviewErrorCode;
  readonly retryable: boolean;
  readonly warning: string;
} {
  if (!(error instanceof ProviderError)) {
    return {
      code: DeepReviewErrorCode.PROVIDER_UNAVAILABLE,
      retryable: true,
      warning: 'The AI provider failed unexpectedly; DEEP review remains retryable.',
    };
  }
  switch (error.code) {
    case ProviderErrorCode.AUTHENTICATION:
      return {
        code: DeepReviewErrorCode.PROVIDER_AUTH,
        retryable: false,
        warning: 'AI-provider authentication failed; configuration must be corrected.',
      };
    case ProviderErrorCode.RATE_LIMIT:
      return {
        code: /quota|credit/i.test(error.message)
          ? DeepReviewErrorCode.PROVIDER_QUOTA
          : DeepReviewErrorCode.PROVIDER_RATE_LIMIT,
        retryable: true,
        warning: /quota|credit/i.test(error.message)
          ? 'The AI-provider quota is exhausted; retry after it resets.'
          : 'The AI-provider rate limit was reached; retry later.',
      };
    case ProviderErrorCode.TIMEOUT:
      return {
        code: DeepReviewErrorCode.PROVIDER_TIMEOUT,
        retryable: true,
        warning: 'The AI-provider request timed out; DEEP review remains retryable.',
      };
    case ProviderErrorCode.INVALID_RESPONSE:
      return {
        code: DeepReviewErrorCode.OUTPUT_INVALID,
        retryable: true,
        warning: 'The AI provider returned malformed DEEP output; no review was stored.',
      };
    case ProviderErrorCode.REQUEST_REJECTED:
      return {
        code: DeepReviewErrorCode.REQUEST_REJECTED,
        retryable: false,
        warning: 'The AI provider rejected the DEEP review request.',
      };
    default:
      return {
        code: DeepReviewErrorCode.PROVIDER_UNAVAILABLE,
        retryable: true,
        warning: 'The configured DEEP model is temporarily unavailable; review remains retryable.',
      };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonObject(value: unknown): Record<string, unknown> {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (!isRecord(parsed)) throw new Error('AI analysis must be a JSON object');
  return parsed;
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length > 0;
}

function isPositiveRank(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isScore(value: unknown): boolean {
  const score = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN;
  return Number.isFinite(score) && score >= 0 && score <= 100;
}
