import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { validNewsSnapshot } from '../ai-analysis/ai-evidence-builder';
import { AI_ROUTING_V1_CONFIG } from '../ai-analysis/config/ai-routing-v1.config';
import { AiAnalysisTier } from '../ai-analysis/models/ai-analysis-tier.enum';
import { AiRoutingDecision } from '../ai-analysis/models/ai-routing-decision.model';
import { DeepReviewRecommendation } from '../ai-analysis/models/deep-review-recommendation.enum';
import { DeepReviewResult } from '../ai-analysis/models/deep-review-result.model';
import { EscalationReason } from '../ai-analysis/models/escalation-reason.enum';
import { FastTriageResult, TriageRiskLevel } from '../ai-analysis/models/fast-triage-result.model';
import { CandidateStatus } from '../common/enums/candidate-status.enum';
import { EventSource } from '../common/enums/event-source.enum';
import { TradeEventType } from '../common/enums/trade-event-type.enum';
import { elapsedMilliseconds, structuredError } from '../logging/logging.utils';
import { Instrument } from '../instruments/entities/instrument.entity';
import { JournalService } from '../journal/journal.service';
import { CANDIDATE_DEEP_REVIEW_PROMPT_VERSION } from '../providers/ai/openrouter/prompts/candidate-deep-review-v1';
import { CANDIDATE_FAST_TRIAGE_PROMPT_VERSION } from '../providers/ai/openrouter/prompts/candidate-fast-triage-v1';
import { TradeCandidate } from './entities/trade-candidate.entity';
import {
  CANDIDATE_DECISION_VERSION,
  CandidateDecisionFailureCode,
  CandidateDecisionIncomplete,
  CandidateDecisionOutcome,
  CandidateDecisionResult,
  CandidateDecisionSnapshot,
  CandidateDecisionSuccess,
} from './models/candidate-decision.model';

interface PersistedAiEvidence {
  readonly fast: FastTriageResult;
  readonly fastEvidenceHash: string;
  readonly routing: AiRoutingDecision;
  readonly deep?: DeepReviewResult;
  readonly deepEvidenceHash?: string;
}

interface DecisionLogContext {
  symbol?: string;
  strategy?: string;
  previousStatus?: CandidateStatus;
}

@Injectable()
export class CandidateDecisionService {
  private readonly logger = new Logger(CandidateDecisionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly journal: JournalService,
  ) {}

  async finalizeCandidate(candidateId: string): Promise<CandidateDecisionResult> {
    const startedAt = performance.now();
    const context: DecisionLogContext = {};
    this.logger.log(
      {
        event: 'candidate.decision.started',
        module: CandidateDecisionService.name,
        operation: 'finalizeCandidate',
        candidateId,
        decisionVersion: CANDIDATE_DECISION_VERSION,
      },
      'Candidate final decision started',
    );

    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(TradeCandidate);
        const candidate = await repository.findOne({
          where: { id: candidateId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!candidate) {
          throw new NotFoundException({
            code: 'CANDIDATE_NOT_FOUND',
            message: 'Trade candidate was not found',
            candidateId,
          });
        }
        context.symbol = candidate.symbol;
        context.strategy = candidate.strategy;
        context.previousStatus = candidate.status;

        if (candidate.decisionSnapshot) {
          const snapshot = parseDecisionSnapshot(candidate.decisionSnapshot);
          if (
            !snapshot ||
            candidate.decidedAt?.toISOString() !== snapshot.decidedAt ||
            (isFinalStatus(candidate.status) && snapshot.status !== candidate.status) ||
            candidate.status === CandidateStatus.NEW ||
            candidate.status === CandidateStatus.ANALYZED
          ) {
            throw invalidTransition(
              candidate,
              'Finalized candidate has no reusable valid decision snapshot',
            );
          }
          return decisionSuccess(candidate.id, snapshot, true);
        }
        if (isFinalStatus(candidate.status)) {
          throw invalidTransition(
            candidate,
            'Finalized candidate has no reusable valid decision snapshot',
          );
        }
        if (candidate.status !== CandidateStatus.NEW) {
          throw invalidTransition(
            candidate,
            `Candidate in ${candidate.status} cannot be finalized`,
          );
        }

        if (!hasCompleteDeterministicEvidence(candidate)) {
          return incomplete(
            candidate,
            CandidateDecisionFailureCode.CANDIDATE_NOT_ELIGIBLE,
            false,
            'Completed deterministic candidate and risk evidence are required',
          );
        }
        const instrument = await manager.getRepository(Instrument).findOneBy({
          symbol: candidate.symbol,
          exchange: candidate.exchange,
        });
        if (!instrument?.name?.trim()) {
          return incomplete(
            candidate,
            CandidateDecisionFailureCode.CANDIDATE_NOT_ELIGIBLE,
            false,
            'Candidate instrument company metadata is required',
          );
        }
        const parsed = parsePersistedAiEvidence(candidate.aiAnalysis);

        const decidedAt = new Date();
        const snapshot: CandidateDecisionSnapshot = {
          version: CANDIDATE_DECISION_VERSION,
          outcome: CandidateDecisionOutcome.QUALIFIED,
          previousStatus: CandidateStatus.NEW,
          status: CandidateStatus.QUALIFIED,
          sourceTier: AiAnalysisTier.DETERMINISTIC,
          reasons: [
            'Deterministic strategy qualification passed',
            'Deterministic risk controls accepted the candidate',
            'AI and news are advisory in V1 and do not change the trade decision',
          ],
          warnings: qualitativeWarnings(candidate, parsed),
          ...(parsed?.deep ? { aiRecommendation: parsed.deep.recommendation } : {}),
          ...(parsed ? { fastEvidenceHash: parsed.fastEvidenceHash } : {}),
          ...(parsed?.deepEvidenceHash ? { deepEvidenceHash: parsed.deepEvidenceHash } : {}),
          ...(parsed ? { routingVersion: parsed.routing.version } : {}),
          decidedAt: decidedAt.toISOString(),
        };
        candidate.status = CandidateStatus.QUALIFIED;
        candidate.decisionSnapshot = jsonRecord(snapshot);
        candidate.decidedAt = decidedAt;
        await repository.save(candidate);
        await this.journal.record(manager, {
          candidateId,
          eventType: TradeEventType.CANDIDATE_QUALIFIED,
          source: EventSource.SYSTEM,
          data: {
            decisionVersion: snapshot.version,
            outcome: snapshot.outcome,
            previousStatus: snapshot.previousStatus,
            status: snapshot.status,
            sourceTier: snapshot.sourceTier,
            routingVersion: snapshot.routingVersion,
            aiRecommendation: snapshot.aiRecommendation ?? null,
            fastEvidenceHash: snapshot.fastEvidenceHash ?? null,
            deepEvidenceHash: snapshot.deepEvidenceHash ?? null,
          },
        });
        return decisionSuccess(candidateId, snapshot, false);
      });

      this.logResult(result, context, startedAt);
      return result;
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'candidate.decision.failed',
          module: CandidateDecisionService.name,
          operation: 'finalizeCandidate',
          candidateId,
          ...context,
          decisionVersion: CANDIDATE_DECISION_VERSION,
          durationMs: elapsedMilliseconds(startedAt),
          ...structuredError(error),
        },
        'Candidate final decision failed',
      );
      throw error;
    }
  }

  private logResult(
    result: CandidateDecisionResult,
    context: DecisionLogContext,
    startedAt: number,
  ): void {
    const fields = {
      module: CandidateDecisionService.name,
      operation: 'finalizeCandidate',
      candidateId: result.candidateId,
      ...context,
      newStatus: result.newStatus,
      decisionVersion: CANDIDATE_DECISION_VERSION,
      durationMs: elapsedMilliseconds(startedAt),
    };
    if (!result.finalized) {
      const event =
        result.errorCode === CandidateDecisionFailureCode.POLICY_INCONSISTENCY
          ? 'candidate.decision.policy_inconsistency'
          : 'candidate.decision.incomplete';
      this.logger.warn(
        { event, ...fields, errorCode: result.errorCode, retryable: result.retryable },
        'Candidate final decision was not completed',
      );
    } else if (result.reusedExistingDecision) {
      this.logger.log(
        {
          event: 'candidate.decision.reused',
          ...fields,
          sourceTier: result.sourceTier,
          aiRecommendation: result.aiRecommendation,
          outcome: result.outcome,
        },
        'Existing candidate final decision reused',
      );
    } else {
      this.logger.log(
        {
          event: 'candidate.decision.completed',
          ...fields,
          sourceTier: result.sourceTier,
          aiRecommendation: result.aiRecommendation,
          outcome: result.outcome,
        },
        'Candidate final decision completed',
      );
    }
  }
}

function hasCompleteDeterministicEvidence(candidate: TradeCandidate): boolean {
  return (
    Boolean(candidate.scanResultId) &&
    isNonEmptyRecord(candidate.technicalSnapshot) &&
    isNonEmptyRecord(candidate.riskSnapshot) &&
    isNonEmptyRecord(candidate.marketRegimeSnapshot) &&
    isNonEmptyRecord(candidate.strategySnapshot) &&
    isNonEmptyRecord(candidate.rankingSnapshot)
  );
}

function qualitativeWarnings(
  candidate: TradeCandidate,
  analysis: PersistedAiEvidence | null,
): readonly string[] {
  const warnings: string[] = [];
  if (!candidate.newsEnrichedAt || !validNewsSnapshot(candidate.newsSnapshot)) {
    warnings.push(
      'News enrichment was unavailable and was not used for the deterministic decision',
    );
  }
  if (!analysis) {
    warnings.push('AI review was unavailable and was not used for the deterministic decision');
  } else if (analysis.routing.escalate && !analysis.deep) {
    warnings.push('DEEP AI review was unavailable and was not used for the deterministic decision');
  }
  return warnings;
}

function parsePersistedAiEvidence(
  value: Record<string, unknown> | null,
): PersistedAiEvidence | null {
  if (!isRecord(value) || !isRecord(value.fast) || !isRecord(value.routing)) return null;
  const fastHash = value.fast.evidenceHash;
  if (!isSha256(fastHash)) return null;
  const { evidenceHash: _fastHash, ...fastValue } = value.fast;
  if (!validFast(fastValue) || !validRouting(value.routing)) return null;
  const fast = fastValue as unknown as FastTriageResult;
  const routing = value.routing as unknown as AiRoutingDecision;
  if (value.deep == null) return { fast, fastEvidenceHash: fastHash, routing };
  if (!isRecord(value.deep) || !isSha256(value.deep.evidenceHash)) return null;
  const deepHash = value.deep.evidenceHash;
  const { evidenceHash: _deepHash, ...deepValue } = value.deep;
  if (!validDeep(deepValue)) return null;
  return {
    fast,
    fastEvidenceHash: fastHash,
    routing,
    deep: deepValue as unknown as DeepReviewResult,
    deepEvidenceHash: deepHash,
  };
}

function validFast(value: Record<string, unknown>): boolean {
  return (
    value.tier === AiAnalysisTier.FAST &&
    isRisk(value.eventRisk) &&
    isRisk(value.uncertainty) &&
    isConfidence(value.confidence) &&
    typeof value.newsSummary === 'string' &&
    stringArray(value.bullishFactors) &&
    stringArray(value.bearishFactors) &&
    stringArray(value.contradictions) &&
    stringArray(value.missingEvidence) &&
    stringArray(value.redFlags) &&
    typeof value.requiresDeepReviewSuggested === 'boolean' &&
    typeof value.summary === 'string' &&
    isRecord(value.modelMetadata) &&
    value.modelMetadata.analysisTier === AiAnalysisTier.FAST &&
    value.modelMetadata.promptVersion === CANDIDATE_FAST_TRIAGE_PROMPT_VERSION &&
    value.modelMetadata.routingVersion === AI_ROUTING_V1_CONFIG.version &&
    value.modelMetadata.structuredOutput === true
  );
}

function validRouting(value: Record<string, unknown>): boolean {
  return (
    value.version === AI_ROUTING_V1_CONFIG.version &&
    typeof value.escalate === 'boolean' &&
    Array.isArray(value.reasons) &&
    value.reasons.every((reason) =>
      Object.values(EscalationReason).includes(reason as EscalationReason),
    ) &&
    value.tierSelected === (value.escalate ? AiAnalysisTier.DEEP : AiAnalysisTier.FAST) &&
    typeof value.decidedAt === 'string' &&
    !Number.isNaN(Date.parse(value.decidedAt)) &&
    Number.isInteger(value.topRankThreshold) &&
    Number(value.topRankThreshold) > 0
  );
}

function validDeep(value: Record<string, unknown>): boolean {
  return (
    value.tier === AiAnalysisTier.DEEP &&
    isRisk(value.overallRisk) &&
    isRisk(value.eventRisk) &&
    isRisk(value.uncertainty) &&
    isConfidence(value.confidence) &&
    typeof value.marketContextSummary === 'string' &&
    typeof value.sectorContextSummary === 'string' &&
    typeof value.newsSummary === 'string' &&
    stringArray(value.bullishFactors) &&
    stringArray(value.bearishFactors) &&
    stringArray(value.contradictions) &&
    stringArray(value.redFlags) &&
    stringArray(value.missingEvidence) &&
    typeof value.thesis === 'string' &&
    stringArray(value.invalidationConcerns) &&
    Object.values(DeepReviewRecommendation).includes(
      value.recommendation as DeepReviewRecommendation,
    ) &&
    stringArray(value.recommendationReasons) &&
    value.recommendationReasons.length > 0 &&
    typeof value.summary === 'string' &&
    isRecord(value.modelMetadata) &&
    value.modelMetadata.analysisTier === AiAnalysisTier.DEEP &&
    value.modelMetadata.promptVersion === CANDIDATE_DEEP_REVIEW_PROMPT_VERSION &&
    value.modelMetadata.routingVersion === AI_ROUTING_V1_CONFIG.version &&
    value.modelMetadata.structuredOutput === true
  );
}

function decisionSuccess(
  candidateId: string,
  snapshot: CandidateDecisionSnapshot,
  reusedExistingDecision: boolean,
): CandidateDecisionSuccess {
  return {
    candidateId,
    finalized: true,
    reusedExistingDecision,
    ...snapshot,
    newStatus: snapshot.status,
  };
}

function incomplete(
  candidate: TradeCandidate,
  errorCode: CandidateDecisionFailureCode,
  retryable: boolean,
  reason: string,
): CandidateDecisionIncomplete {
  return {
    candidateId: candidate.id,
    finalized: false,
    previousStatus: candidate.status,
    newStatus: candidate.status,
    errorCode,
    retryable,
    reasons: [reason],
    warnings: [],
  };
}

function parseDecisionSnapshot(
  value: Record<string, unknown> | null,
): CandidateDecisionSnapshot | null {
  if (
    !isRecord(value) ||
    value.version !== CANDIDATE_DECISION_VERSION ||
    !Object.values(CandidateDecisionOutcome).includes(value.outcome as CandidateDecisionOutcome) ||
    value.previousStatus !== CandidateStatus.NEW ||
    !isFinalStatus(value.status) ||
    !Object.values(AiAnalysisTier).includes(value.sourceTier as AiAnalysisTier) ||
    !stringArray(value.reasons) ||
    !stringArray(value.warnings) ||
    typeof value.decidedAt !== 'string' ||
    Number.isNaN(Date.parse(value.decidedAt))
  )
    return null;
  if (value.fastEvidenceHash !== undefined && !isSha256(value.fastEvidenceHash)) return null;
  if (value.routingVersion !== undefined && typeof value.routingVersion !== 'string') return null;
  if (value.deepEvidenceHash !== undefined && !isSha256(value.deepEvidenceHash)) return null;
  if (
    value.aiRecommendation !== undefined &&
    !Object.values(DeepReviewRecommendation).includes(
      value.aiRecommendation as DeepReviewRecommendation,
    )
  )
    return null;
  return value as unknown as CandidateDecisionSnapshot;
}

function invalidTransition(candidate: TradeCandidate, message: string): ConflictException {
  return new ConflictException({
    code: 'INVALID_STATE_TRANSITION',
    message,
    candidateId: candidate.id,
    status: candidate.status,
  });
}

function isFinalStatus(value: unknown): value is CandidateDecisionSnapshot['status'] {
  return (
    value === CandidateStatus.QUALIFIED ||
    value === CandidateStatus.WAIT ||
    value === CandidateStatus.REJECTED
  );
}

function isRisk(value: unknown): value is TriageRiskLevel {
  return Object.values(TriageRiskLevel).includes(value as TriageRiskLevel);
}

function isConfidence(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1;
}

function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && item.trim().length > 0)
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length > 0;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  const result: unknown = JSON.parse(JSON.stringify(value));
  if (!isRecord(result)) throw new Error('Candidate decision snapshot must be a JSON object');
  return result;
}
