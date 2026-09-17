import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { buildFastTriageInput, validNewsSnapshot } from '../ai-analysis/ai-evidence-builder';
import { deepEvidenceHash, fastEvidenceHash } from '../ai-analysis/ai-evidence-hash';
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
    this.logger.log({
      event: 'candidate.decision.started', module: CandidateDecisionService.name,
      operation: 'finalizeCandidate', candidateId, decisionVersion: CANDIDATE_DECISION_VERSION,
    }, 'Candidate final decision started');

    try {
      const result = await this.dataSource.transaction(async manager => {
        const repository = manager.getRepository(TradeCandidate);
        const candidate = await repository.findOne({
          where: { id: candidateId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!candidate) {
          throw new NotFoundException({
            code: 'CANDIDATE_NOT_FOUND', message: 'Trade candidate was not found', candidateId,
          });
        }
        context.symbol = candidate.symbol;
        context.strategy = candidate.strategy;
        context.previousStatus = candidate.status;

        if (candidate.decisionSnapshot) {
          const snapshot = parseDecisionSnapshot(candidate.decisionSnapshot);
          if (!snapshot || candidate.decidedAt?.toISOString() !== snapshot.decidedAt ||
              (isFinalStatus(candidate.status) && snapshot.status !== candidate.status) ||
              candidate.status === CandidateStatus.NEW || candidate.status === CandidateStatus.ANALYZED) {
            throw invalidTransition(candidate, 'Finalized candidate has no reusable valid decision snapshot');
          }
          return decisionSuccess(candidate.id, snapshot, true);
        }
        if (isFinalStatus(candidate.status)) {
          throw invalidTransition(candidate, 'Finalized candidate has no reusable valid decision snapshot');
        }
        if (candidate.status !== CandidateStatus.NEW) {
          throw invalidTransition(candidate, `Candidate in ${candidate.status} cannot be finalized`);
        }

        if (!candidate.scanResultId || !isNonEmptyRecord(candidate.riskSnapshot)) {
          return incomplete(candidate, CandidateDecisionFailureCode.CANDIDATE_NOT_ELIGIBLE, false,
            'Completed deterministic candidate and risk evidence are required');
        }
        if (!candidate.newsEnrichedAt || !validNewsSnapshot(candidate.newsSnapshot)) {
          return incomplete(candidate, CandidateDecisionFailureCode.NEWS_ENRICHMENT_REQUIRED, true,
            'A successful completed news snapshot is required');
        }
        const instrument = await manager.getRepository(Instrument).findOneBy({
          symbol: candidate.symbol,
          exchange: candidate.exchange,
        });
        if (!instrument?.name?.trim()) {
          return incomplete(candidate, CandidateDecisionFailureCode.CANDIDATE_NOT_ELIGIBLE, false,
            'Candidate instrument company metadata is required');
        }
        try {
          buildFastTriageInput(candidate, instrument.name);
        } catch {
          return incomplete(candidate, CandidateDecisionFailureCode.CANDIDATE_NOT_ELIGIBLE, false,
            'Persisted deterministic candidate evidence is incomplete');
        }

        const parsed = parsePersistedAiEvidence(candidate.aiAnalysis);
        if (!parsed) {
          const hasFast = isRecord(candidate.aiAnalysis) && candidate.aiAnalysis.fast != null;
          return incomplete(candidate, hasFast
            ? CandidateDecisionFailureCode.AI_ANALYSIS_INCOMPLETE
            : CandidateDecisionFailureCode.FAST_ANALYSIS_REQUIRED, true,
          hasFast ? 'Persisted FAST analysis or routing is invalid'
            : 'Completed FAST analysis is required');
        }
        const expectedFastHash = fastEvidenceHash(
          candidate,
          instrument.name,
          CANDIDATE_FAST_TRIAGE_PROMPT_VERSION,
        );
        if (parsed.fastEvidenceHash !== expectedFastHash) {
          return incomplete(candidate, CandidateDecisionFailureCode.AI_ANALYSIS_INCOMPLETE, true,
            'Candidate evidence changed after FAST analysis');
        }

        const inconsistencies = routingInconsistencies(candidate, parsed.fast, parsed.routing);
        if (inconsistencies.length) {
          return incomplete(candidate, CandidateDecisionFailureCode.POLICY_INCONSISTENCY, true,
            inconsistencies.join('; '));
        }

        let outcome: CandidateDecisionOutcome;
        let status: CandidateDecisionSnapshot['status'];
        let sourceTier: AiAnalysisTier;
        let reasons: readonly string[];
        let aiRecommendation: DeepReviewRecommendation | undefined;
        let usedDeepHash: string | undefined;

        if (parsed.routing.escalate) {
          if (!parsed.deep || !parsed.deepEvidenceHash) {
            return incomplete(candidate, CandidateDecisionFailureCode.DEEP_REVIEW_REQUIRED, true,
              'Deterministic routing requires a completed DEEP review');
          }
          const expectedDeepHash = deepEvidenceHash(
            candidate,
            instrument.name,
            parsed.fast,
            parsed.routing,
            CANDIDATE_DEEP_REVIEW_PROMPT_VERSION,
          );
          if (parsed.deepEvidenceHash !== expectedDeepHash) {
            return incomplete(candidate, CandidateDecisionFailureCode.AI_ANALYSIS_INCOMPLETE, true,
              'Candidate, FAST, or routing evidence changed after DEEP review');
          }
          ({ outcome, status } = mapDeepRecommendation(parsed.deep.recommendation));
          sourceTier = AiAnalysisTier.DEEP;
          reasons = parsed.deep.recommendationReasons;
          aiRecommendation = parsed.deep.recommendation;
          usedDeepHash = parsed.deepEvidenceHash;
        } else {
          if (parsed.fast.eventRisk !== TriageRiskLevel.LOW ||
              parsed.fast.uncertainty === TriageRiskLevel.HIGH ||
              parsed.fast.contradictions.length || parsed.fast.missingEvidence.length ||
              parsed.fast.redFlags.length || parsed.fast.requiresDeepReviewSuggested) {
            return incomplete(candidate, CandidateDecisionFailureCode.POLICY_INCONSISTENCY, true,
              'FAST-only evidence contains unresolved risk that cannot be qualified safely');
          }
          outcome = CandidateDecisionOutcome.QUALIFIED;
          status = CandidateStatus.QUALIFIED;
          sourceTier = AiAnalysisTier.FAST;
          reasons = [
            'FAST event risk is LOW',
            'No contradictions, critical missing evidence, or red flags remain',
            'Deterministic routing selected FAST as sufficient',
          ];
        }

        const decidedAt = new Date();
        const snapshot: CandidateDecisionSnapshot = {
          version: CANDIDATE_DECISION_VERSION,
          outcome,
          previousStatus: CandidateStatus.NEW,
          status,
          sourceTier,
          reasons,
          warnings: [],
          ...(aiRecommendation ? { aiRecommendation } : {}),
          fastEvidenceHash: parsed.fastEvidenceHash,
          ...(usedDeepHash ? { deepEvidenceHash: usedDeepHash } : {}),
          routingVersion: parsed.routing.version,
          decidedAt: decidedAt.toISOString(),
        };
        candidate.status = status;
        candidate.decisionSnapshot = jsonRecord(snapshot);
        candidate.decidedAt = decidedAt;
        await repository.save(candidate);
        await this.journal.record(manager, {
          candidateId,
          eventType: decisionEventType(outcome),
          source: EventSource.SYSTEM,
          data: {
            decisionVersion: snapshot.version,
            outcome: snapshot.outcome,
            previousStatus: snapshot.previousStatus,
            status: snapshot.status,
            sourceTier: snapshot.sourceTier,
            routingVersion: snapshot.routingVersion,
            aiRecommendation: snapshot.aiRecommendation ?? null,
            fastEvidenceHash: snapshot.fastEvidenceHash,
            deepEvidenceHash: snapshot.deepEvidenceHash ?? null,
          },
        });
        return decisionSuccess(candidateId, snapshot, false);
      });

      this.logResult(result, context, startedAt);
      return result;
    } catch (error: unknown) {
      this.logger.error({
        event: 'candidate.decision.failed', module: CandidateDecisionService.name,
        operation: 'finalizeCandidate', candidateId, ...context,
        decisionVersion: CANDIDATE_DECISION_VERSION,
        durationMs: elapsedMilliseconds(startedAt), ...structuredError(error),
      }, 'Candidate final decision failed');
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
      const event = result.errorCode === CandidateDecisionFailureCode.POLICY_INCONSISTENCY
        ? 'candidate.decision.policy_inconsistency' : 'candidate.decision.incomplete';
      this.logger.warn({ event, ...fields, errorCode: result.errorCode,
        retryable: result.retryable }, 'Candidate final decision was not completed');
    } else if (result.reusedExistingDecision) {
      this.logger.log({ event: 'candidate.decision.reused', ...fields,
        sourceTier: result.sourceTier, aiRecommendation: result.aiRecommendation,
        outcome: result.outcome }, 'Existing candidate final decision reused');
    } else {
      this.logger.log({ event: 'candidate.decision.completed', ...fields,
        sourceTier: result.sourceTier, aiRecommendation: result.aiRecommendation,
        outcome: result.outcome }, 'Candidate final decision completed');
    }
  }
}

function parsePersistedAiEvidence(value: Record<string, unknown> | null): PersistedAiEvidence | null {
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
  return value.tier === AiAnalysisTier.FAST && isRisk(value.eventRisk) && isRisk(value.uncertainty) &&
    isConfidence(value.confidence) && typeof value.newsSummary === 'string' &&
    stringArray(value.bullishFactors) && stringArray(value.bearishFactors) &&
    stringArray(value.contradictions) && stringArray(value.missingEvidence) &&
    stringArray(value.redFlags) && typeof value.requiresDeepReviewSuggested === 'boolean' &&
    typeof value.summary === 'string' && isRecord(value.modelMetadata) &&
    value.modelMetadata.analysisTier === AiAnalysisTier.FAST &&
    value.modelMetadata.promptVersion === CANDIDATE_FAST_TRIAGE_PROMPT_VERSION &&
    value.modelMetadata.routingVersion === AI_ROUTING_V1_CONFIG.version &&
    value.modelMetadata.structuredOutput === true;
}

function validRouting(value: Record<string, unknown>): boolean {
  return value.version === AI_ROUTING_V1_CONFIG.version && typeof value.escalate === 'boolean' &&
    Array.isArray(value.reasons) && value.reasons.every(reason =>
      Object.values(EscalationReason).includes(reason as EscalationReason)) &&
    value.tierSelected === (value.escalate ? AiAnalysisTier.DEEP : AiAnalysisTier.FAST) &&
    typeof value.decidedAt === 'string' && !Number.isNaN(Date.parse(value.decidedAt)) &&
    Number.isInteger(value.topRankThreshold) && Number(value.topRankThreshold) > 0;
}

function validDeep(value: Record<string, unknown>): boolean {
  return value.tier === AiAnalysisTier.DEEP && isRisk(value.overallRisk) &&
    isRisk(value.eventRisk) && isRisk(value.uncertainty) && isConfidence(value.confidence) &&
    typeof value.marketContextSummary === 'string' && typeof value.sectorContextSummary === 'string' &&
    typeof value.newsSummary === 'string' && stringArray(value.bullishFactors) &&
    stringArray(value.bearishFactors) && stringArray(value.contradictions) &&
    stringArray(value.redFlags) && stringArray(value.missingEvidence) &&
    typeof value.thesis === 'string' && stringArray(value.invalidationConcerns) &&
    Object.values(DeepReviewRecommendation).includes(value.recommendation as DeepReviewRecommendation) &&
    stringArray(value.recommendationReasons) && value.recommendationReasons.length > 0 &&
    typeof value.summary === 'string' && isRecord(value.modelMetadata) &&
    value.modelMetadata.analysisTier === AiAnalysisTier.DEEP &&
    value.modelMetadata.promptVersion === CANDIDATE_DEEP_REVIEW_PROMPT_VERSION &&
    value.modelMetadata.routingVersion === AI_ROUTING_V1_CONFIG.version &&
    value.modelMetadata.structuredOutput === true;
}

function routingInconsistencies(
  candidate: TradeCandidate,
  fast: FastTriageResult,
  routing: AiRoutingDecision,
): readonly string[] {
  const expected: EscalationReason[] = [];
  if (fast.eventRisk === TriageRiskLevel.HIGH) expected.push(EscalationReason.HIGH_EVENT_RISK);
  if (fast.uncertainty === TriageRiskLevel.HIGH) expected.push(EscalationReason.HIGH_UNCERTAINTY);
  if (Number(fast.confidence) < AI_ROUTING_V1_CONFIG.minimumFastConfidence) {
    expected.push(EscalationReason.LOW_MODEL_CONFIDENCE);
  }
  if (fast.contradictions.length) expected.push(EscalationReason.CONTRADICTORY_EVIDENCE);
  if (fast.missingEvidence.length) expected.push(EscalationReason.MISSING_CRITICAL_EVIDENCE);
  if (fast.requiresDeepReviewSuggested) expected.push(EscalationReason.MODEL_REQUESTED_ESCALATION);
  if ((candidate.strategyRank as number) <= routing.topRankThreshold ||
      (candidate.globalRank as number) <= routing.topRankThreshold) {
    expected.push(EscalationReason.TOP_RANKED_CANDIDATE);
  }
  const actual = [...routing.reasons];
  const issues: string[] = [];
  if (routing.escalate !== (expected.length > 0)) issues.push('Routing escalation does not match FAST evidence');
  if (expected.some(reason => !actual.includes(reason)) || actual.some(reason => !expected.includes(reason))) {
    issues.push('Routing reasons do not match deterministic ai-routing-v1 rules');
  }
  return issues;
}

function mapDeepRecommendation(recommendation: DeepReviewRecommendation): {
  readonly outcome: CandidateDecisionOutcome;
  readonly status: CandidateDecisionSnapshot['status'];
} {
  switch (recommendation) {
    case DeepReviewRecommendation.QUALIFIED:
      return { outcome: CandidateDecisionOutcome.QUALIFIED, status: CandidateStatus.QUALIFIED };
    case DeepReviewRecommendation.WAIT:
      return { outcome: CandidateDecisionOutcome.WAIT, status: CandidateStatus.WAIT };
    case DeepReviewRecommendation.REJECT:
      return { outcome: CandidateDecisionOutcome.REJECTED, status: CandidateStatus.REJECTED };
  }
}

function decisionEventType(outcome: CandidateDecisionOutcome): TradeEventType {
  switch (outcome) {
    case CandidateDecisionOutcome.QUALIFIED: return TradeEventType.CANDIDATE_QUALIFIED;
    case CandidateDecisionOutcome.WAIT: return TradeEventType.CANDIDATE_WAIT;
    case CandidateDecisionOutcome.REJECTED: return TradeEventType.CANDIDATE_REJECTED;
  }
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

function parseDecisionSnapshot(value: Record<string, unknown> | null): CandidateDecisionSnapshot | null {
  if (!isRecord(value) || value.version !== CANDIDATE_DECISION_VERSION ||
      !Object.values(CandidateDecisionOutcome).includes(value.outcome as CandidateDecisionOutcome) ||
      value.previousStatus !== CandidateStatus.NEW || !isFinalStatus(value.status) ||
      !Object.values(AiAnalysisTier).includes(value.sourceTier as AiAnalysisTier) ||
      !stringArray(value.reasons) || !stringArray(value.warnings) ||
      !isSha256(value.fastEvidenceHash) || typeof value.routingVersion !== 'string' ||
      typeof value.decidedAt !== 'string' || Number.isNaN(Date.parse(value.decidedAt))) return null;
  if (value.deepEvidenceHash !== undefined && !isSha256(value.deepEvidenceHash)) return null;
  if (value.aiRecommendation !== undefined &&
      !Object.values(DeepReviewRecommendation).includes(value.aiRecommendation as DeepReviewRecommendation)) return null;
  return value as unknown as CandidateDecisionSnapshot;
}

function invalidTransition(candidate: TradeCandidate, message: string): ConflictException {
  return new ConflictException({
    code: 'INVALID_STATE_TRANSITION', message, candidateId: candidate.id, status: candidate.status,
  });
}

function isFinalStatus(value: unknown): value is CandidateDecisionSnapshot['status'] {
  return value === CandidateStatus.QUALIFIED || value === CandidateStatus.WAIT ||
    value === CandidateStatus.REJECTED;
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
  return Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim().length > 0);
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
