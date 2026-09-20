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
import { ProviderError, ProviderErrorCode } from '../providers/provider-error';
import { AiProvider } from '../providers/ai/ai-provider.interface';
import { AI_PROVIDER } from '../providers/ai/ai-provider.token';
import { CANDIDATE_FAST_TRIAGE_PROMPT_VERSION } from '../providers/ai/openrouter/prompts/candidate-fast-triage-v1';
import { AiRoutingPolicy } from './ai-routing-policy.service';
import { AI_ROUTING_V1_CONFIG } from './config/ai-routing-v1.config';
import { AiAnalysisTier } from './models/ai-analysis-tier.enum';
import { AiRoutingDecision } from './models/ai-routing-decision.model';
import {
  AiTriageErrorCode,
  AiTriageExecutionResult,
} from './models/ai-triage-execution-result.model';
import { FastTriageInput, FastTriageResult } from './models/fast-triage-result.model';
import { fastEvidenceHash } from './ai-evidence-hash';
import { buildFastTriageInput, validNewsSnapshot } from './ai-evidence-builder';

enum CandidateTriageEligibilityCode {
  CANDIDATE_NOT_FOUND = 'CANDIDATE_NOT_FOUND',
  CANDIDATE_NOT_PRE_FINAL = 'CANDIDATE_NOT_PRE_FINAL',
  MISSING_DETERMINISTIC_EVIDENCE = 'MISSING_DETERMINISTIC_EVIDENCE',
  NEWS_SNAPSHOT_REQUIRED = 'NEWS_SNAPSHOT_REQUIRED',
}

interface CandidateContext {
  readonly candidate: TradeCandidate;
  readonly instrument: Instrument;
  readonly input: FastTriageInput;
  readonly evidenceHash: string;
}

@Injectable()
export class AiTriageService {
  private readonly logger = new Logger(AiTriageService.name);
  private readonly inFlight = new Map<string, Promise<AiTriageExecutionResult>>();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TradeCandidate)
    private readonly candidates: Repository<TradeCandidate>,
    @InjectRepository(Instrument)
    private readonly instruments: Repository<Instrument>,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider | null,
    private readonly routing: AiRoutingPolicy,
    private readonly config: ConfigService,
  ) {}

  triageCandidate(candidateId: string): Promise<AiTriageExecutionResult> {
    const existing = this.inFlight.get(candidateId);
    if (existing) return existing;
    const execution = this.execute(candidateId).finally(() => {
      if (this.inFlight.get(candidateId) === execution) this.inFlight.delete(candidateId);
    });
    this.inFlight.set(candidateId, execution);
    return execution;
  }

  async analyzeEvidence(
    input: FastTriageInput,
    bypassProviderCache = false,
  ): Promise<FastTriageResult> {
    if (!this.provider) throw new Error('No AI provider is configured');
    return this.provider.triageCandidate(input, {
      tier: AiAnalysisTier.FAST,
      requestedModel: this.config.getOrThrow<string>('openrouter.fastModel'),
      promptVersion: CANDIDATE_FAST_TRIAGE_PROMPT_VERSION,
      bypassCache: bypassProviderCache,
    });
  }

  private async execute(candidateId: string): Promise<AiTriageExecutionResult> {
    const startedAt = performance.now();
    let context: CandidateContext | undefined;
    try {
      context = await this.loadContext(candidateId);
      const requestedModel = this.config.getOrThrow<string>('openrouter.fastModel');
      const fields = this.logContext(context, requestedModel);
      this.logger.log({ event: 'ai.fast.started', ...fields }, 'Candidate FAST AI triage started');

      const reused = storedAnalysis(context.candidate.aiAnalysis, context.evidenceHash);
      if (reused) {
        this.logger.log(
          {
            event: 'ai.fast.reused',
            ...fields,
            resolvedModel: reused.fast.modelMetadata.resolvedModel,
            escalate: reused.routing.escalate,
            escalationReasons: reused.routing.reasons,
            durationMs: elapsedMilliseconds(startedAt),
            status: 'reused',
          },
          'Existing candidate FAST AI triage reused',
        );
        return this.success(candidateId, context.evidenceHash, reused.fast, reused.routing, true);
      }

      if (!this.provider) {
        return this.failure(
          context,
          startedAt,
          AiTriageErrorCode.PROVIDER_NOT_CONFIGURED,
          false,
          'No AI provider is configured; set AI_PROVIDER before retrying.',
        );
      }

      let analysis: FastTriageResult;
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

      const decision = this.routing.decide(analysis, {
        strategyRank: context.candidate.strategyRank as number,
        globalRank: context.candidate.globalRank as number,
      });
      const auditedAnalysis: FastTriageResult = {
        ...analysis,
        modelMetadata: {
          ...analysis.modelMetadata,
          routingVersion: decision.version,
        },
      };
      this.logger.log(
        {
          event: 'ai.routing.completed',
          ...fields,
          resolvedModel: analysis.modelMetadata.resolvedModel,
          escalate: decision.escalate,
          escalationReasons: decision.reasons,
          tierSelected: decision.tierSelected,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'completed',
        },
        'Candidate AI routing completed',
      );

      const persisted = await this.persist(context, auditedAnalysis, decision);
      if (!persisted) {
        return this.failure(
          context,
          startedAt,
          AiTriageErrorCode.EVIDENCE_CHANGED,
          true,
          'Candidate evidence changed during FAST triage; retry against the latest snapshot.',
        );
      }
      this.logger.log(
        {
          event: 'ai.fast.completed',
          ...fields,
          resolvedModel: analysis.modelMetadata.resolvedModel,
          escalate: decision.escalate,
          escalationReasons: decision.reasons,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'completed',
        },
        'Candidate FAST AI triage completed',
      );
      return this.success(candidateId, context.evidenceHash, auditedAnalysis, decision, false);
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'ai.fast.failed',
          module: AiTriageService.name,
          operation: 'triageCandidate',
          candidateId,
          ...(context
            ? { symbol: context.candidate.symbol, strategy: context.candidate.strategy }
            : {}),
          promptVersion: CANDIDATE_FAST_TRIAGE_PROMPT_VERSION,
          routingVersion: AI_ROUTING_V1_CONFIG.version,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'failed',
          ...structuredError(error),
        },
        'Candidate FAST AI triage failed',
      );
      throw error;
    }
  }

  private async loadContext(candidateId: string): Promise<CandidateContext> {
    const candidate = await this.candidates.findOneBy({ id: candidateId });
    if (!candidate) {
      throw new NotFoundException({
        code: CandidateTriageEligibilityCode.CANDIDATE_NOT_FOUND,
        message: 'Trade candidate was not found',
        candidateId,
      });
    }
    this.ensureEligible(candidate);
    const instrument = await this.instruments.findOneBy({
      symbol: candidate.symbol,
      exchange: candidate.exchange,
    });
    if (!instrument?.name?.trim()) {
      this.ineligible(
        candidate,
        CandidateTriageEligibilityCode.MISSING_DETERMINISTIC_EVIDENCE,
        'Candidate instrument company metadata is required for FAST triage',
      );
    }
    const input = buildFastTriageInput(candidate, instrument.name);
    return {
      candidate,
      instrument,
      input,
      evidenceHash: fastEvidenceHash(
        candidate,
        instrument.name,
        CANDIDATE_FAST_TRIAGE_PROMPT_VERSION,
      ),
    };
  }

  private ensureEligible(candidate: TradeCandidate): void {
    if (candidate.status !== CandidateStatus.NEW) {
      this.ineligible(
        candidate,
        CandidateTriageEligibilityCode.CANDIDATE_NOT_PRE_FINAL,
        'FAST triage requires a candidate in NEW status',
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
      !isNonEmptyRecord(candidate.rankingSnapshot)
    ) {
      this.ineligible(
        candidate,
        CandidateTriageEligibilityCode.MISSING_DETERMINISTIC_EVIDENCE,
        'Candidate is missing persisted technical, regime, strategy, ranking, or risk evidence',
      );
    }
    if (!candidate.newsEnrichedAt || !validNewsSnapshot(candidate.newsSnapshot)) {
      this.ineligible(
        candidate,
        CandidateTriageEligibilityCode.NEWS_SNAPSHOT_REQUIRED,
        'A completed candidate news snapshot is required before FAST triage',
      );
    }
  }

  private async persist(
    context: CandidateContext,
    analysis: FastTriageResult,
    routing: AiRoutingDecision,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(TradeCandidate);
      const candidate = await repository.findOne({
        where: { id: context.candidate.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!candidate) return false;
      this.ensureEligible(candidate);
      const instrument = await manager.getRepository(Instrument).findOneBy({
        symbol: candidate.symbol,
        exchange: candidate.exchange,
      });
      if (
        !instrument ||
        fastEvidenceHash(candidate, instrument.name, CANDIDATE_FAST_TRIAGE_PROMPT_VERSION) !==
          context.evidenceHash
      )
        return false;
      const alreadyStored = storedAnalysis(candidate.aiAnalysis, context.evidenceHash);
      if (alreadyStored) return true;

      const existing = isRecord(candidate.aiAnalysis) ? candidate.aiAnalysis : {};
      candidate.aiAnalysis = jsonObject({
        ...existing,
        fast: { ...analysis, evidenceHash: context.evidenceHash },
        routing,
        deep: existing.deep ?? null,
      });
      await repository.save(candidate);
      return true;
    });
  }

  private success(
    candidateId: string,
    hash: string,
    fastAnalysis: FastTriageResult,
    routing: AiRoutingDecision,
    reusedExistingAnalysis: boolean,
  ): AiTriageExecutionResult {
    return {
      candidateId,
      success: true,
      reusedExistingAnalysis,
      evidenceHash: hash,
      fastAnalysis,
      routing,
      warnings: [],
    };
  }

  private failure(
    context: CandidateContext,
    startedAt: number,
    errorCode: AiTriageErrorCode,
    retryable: boolean,
    warning: string,
    error?: unknown,
  ): AiTriageExecutionResult {
    this.logger.error(
      {
        event: 'ai.fast.failed',
        ...this.logContext(context),
        errorCode,
        retryable,
        durationMs: elapsedMilliseconds(startedAt),
        status: 'failed',
        ...(error ? structuredError(error) : {}),
      },
      'Candidate FAST AI triage failed',
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

  private logContext(context: CandidateContext, requestedModel?: string): Record<string, unknown> {
    return {
      module: AiTriageService.name,
      operation: 'triageCandidate',
      candidateId: context.candidate.id,
      symbol: context.candidate.symbol,
      strategy: context.candidate.strategy,
      requestedModel: requestedModel ?? this.config.get<string>('openrouter.fastModel'),
      promptVersion: CANDIDATE_FAST_TRIAGE_PROMPT_VERSION,
      routingVersion: AI_ROUTING_V1_CONFIG.version,
      evidenceHash: context.evidenceHash,
    };
  }

  private ineligible(
    candidate: TradeCandidate,
    code: CandidateTriageEligibilityCode,
    message: string,
  ): never {
    throw new UnprocessableEntityException({ code, message, candidateId: candidate.id });
  }
}

function storedAnalysis(
  value: Record<string, unknown> | null,
  hash: string,
): { readonly fast: FastTriageResult; readonly routing: AiRoutingDecision } | null {
  if (!isRecord(value) || !isRecord(value.fast) || !isRecord(value.routing)) return null;
  if (
    value.fast.evidenceHash !== hash ||
    value.fast.tier !== AiAnalysisTier.FAST ||
    !isRecord(value.fast.modelMetadata) ||
    value.fast.modelMetadata.routingVersion !== AI_ROUTING_V1_CONFIG.version ||
    !Array.isArray(value.fast.contradictions) ||
    !Array.isArray(value.fast.missingEvidence) ||
    value.routing.version !== AI_ROUTING_V1_CONFIG.version ||
    typeof value.routing.escalate !== 'boolean' ||
    !Array.isArray(value.routing.reasons)
  )
    return null;
  const { evidenceHash: _evidenceHash, ...fast } = value.fast;
  return {
    fast: fast as unknown as FastTriageResult,
    routing: value.routing as unknown as AiRoutingDecision,
  };
}

function providerFailure(error: unknown): {
  readonly code: AiTriageErrorCode;
  readonly retryable: boolean;
  readonly warning: string;
} {
  if (!(error instanceof ProviderError)) {
    return {
      code: AiTriageErrorCode.PROVIDER_UNAVAILABLE,
      retryable: true,
      warning: 'The AI provider failed unexpectedly; FAST triage remains retryable.',
    };
  }
  switch (error.code) {
    case ProviderErrorCode.AUTHENTICATION:
      return {
        code: AiTriageErrorCode.PROVIDER_AUTH,
        retryable: false,
        warning: 'AI-provider authentication failed; configuration must be corrected.',
      };
    case ProviderErrorCode.RATE_LIMIT:
      return {
        code: /quota|credit/i.test(error.message)
          ? AiTriageErrorCode.PROVIDER_QUOTA
          : AiTriageErrorCode.PROVIDER_RATE_LIMIT,
        retryable: true,
        warning: /quota|credit/i.test(error.message)
          ? 'The AI-provider quota is exhausted; retry after it resets.'
          : 'The AI-provider rate limit was reached; retry later.',
      };
    case ProviderErrorCode.TIMEOUT:
      return {
        code: AiTriageErrorCode.PROVIDER_TIMEOUT,
        retryable: true,
        warning: 'The AI-provider request timed out; FAST triage remains retryable.',
      };
    case ProviderErrorCode.INVALID_RESPONSE:
      return {
        code: AiTriageErrorCode.OUTPUT_INVALID,
        retryable: true,
        warning: 'The AI provider returned malformed FAST output; no analysis was stored.',
      };
    case ProviderErrorCode.REQUEST_REJECTED:
      return {
        code: AiTriageErrorCode.REQUEST_REJECTED,
        retryable: false,
        warning: 'The AI provider rejected the FAST triage request.',
      };
    default:
      return {
        code: AiTriageErrorCode.PROVIDER_UNAVAILABLE,
        retryable: true,
        warning: 'The AI provider is temporarily unavailable; FAST triage remains retryable.',
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
