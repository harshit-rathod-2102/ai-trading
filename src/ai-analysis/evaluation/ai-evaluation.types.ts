import { PersistedCandidateEvidence } from '../ai-evidence-builder';
import { AiRoutingDecision } from '../models/ai-routing-decision.model';
import { DeepReviewRecommendation } from '../models/deep-review-recommendation.enum';
import { DeepReviewResult } from '../models/deep-review-result.model';
import { EscalationReason } from '../models/escalation-reason.enum';
import { FastTriageResult, TriageRiskLevel } from '../models/fast-triage-result.model';

export enum AiEvaluationMode {
  FAST_ONLY = 'FAST_ONLY',
  FULL = 'FULL',
  FORCE_DEEP = 'FORCE_DEEP',
}

export interface AiEvaluationCandidateEvidence extends PersistedCandidateEvidence {
  readonly companyName: string;
}

export interface FastEvaluationExpectation {
  readonly eligible?: boolean;
  readonly eventRiskOneOf?: readonly TriageRiskLevel[];
  readonly uncertaintyOneOf?: readonly TriageRiskLevel[];
  readonly shouldSuggestDeepReview?: boolean;
  readonly mustMentionMissingEvidence?: boolean;
  readonly mustHaveContradiction?: boolean;
}

export interface RoutingEvaluationExpectation {
  readonly escalate: boolean;
  readonly mustIncludeReasons?: readonly EscalationReason[];
}

export interface DeepEvaluationExpectation {
  readonly recommendationOneOf?: readonly DeepReviewRecommendation[];
  readonly eventRiskOneOf?: readonly TriageRiskLevel[];
  readonly mustHaveContradiction?: boolean;
  readonly mustMentionMissingEvidence?: boolean;
}

export interface SafetyEvaluationExpectation {
  readonly forbiddenClaims: readonly string[];
  readonly promptInjectionPresent?: boolean;
}

export interface AiEvaluationFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly candidateEvidence: AiEvaluationCandidateEvidence;
  readonly expectations: {
    readonly fast?: FastEvaluationExpectation;
    readonly routing?: RoutingEvaluationExpectation;
    readonly deep?: DeepEvaluationExpectation;
    readonly safety: SafetyEvaluationExpectation;
  };
  readonly allowedFacts: readonly string[];
  readonly manualReviewNotes: string;
}

export interface AiEvaluationRunOptions {
  readonly mode: AiEvaluationMode;
  readonly runsPerFixture?: number;
  readonly category?: string;
  readonly fixtureIds?: readonly string[];
}

export interface AiEvaluationChecks {
  readonly passed: readonly string[];
  readonly failed: readonly string[];
  readonly warnings: readonly string[];
}

export interface AiFixtureRunResult {
  readonly runNumber: number;
  readonly fast: {
    readonly executed: boolean;
    readonly success: boolean;
    readonly parsedSuccessfully: boolean;
    readonly schemaValid: boolean;
    readonly requiredFieldsPresent: boolean;
    readonly output?: FastTriageResult;
    readonly durationMs?: number;
    readonly error?: string;
  };
  readonly routing?: {
    readonly actual: AiRoutingDecision;
    readonly expectedMatch: boolean;
    readonly missingExpectedReasons: readonly EscalationReason[];
  };
  readonly deep: {
    readonly executed: boolean;
    readonly success?: boolean;
    readonly parsedSuccessfully?: boolean;
    readonly schemaValid?: boolean;
    readonly requiredFieldsPresent?: boolean;
    readonly output?: DeepReviewResult;
    readonly durationMs?: number;
    readonly error?: string;
  };
  readonly checks: AiEvaluationChecks;
  readonly modelMetadata: Readonly<Record<string, unknown>>;
  readonly passedOverall: boolean;
}

export interface AiFixtureEvaluationResult {
  readonly fixtureId: string;
  readonly fixtureName: string;
  readonly category: string;
  readonly mode: AiEvaluationMode;
  readonly promptVersions: {
    readonly fast: string;
    readonly deep: string;
    readonly routing: string;
  };
  readonly runs: readonly AiFixtureRunResult[];
  readonly consistency: {
    readonly consistent: boolean;
    readonly changedFields: readonly string[];
  };
  readonly passedOverall: boolean;
  readonly allowedFacts: readonly string[];
  readonly manualReviewNotes: string;
}

export interface AiEvaluationSummary {
  readonly fixturesRun: number;
  readonly fixturesPassed: number;
  readonly fixturesFailed: number;
  readonly fastSchemaFailures: number;
  readonly deepSchemaFailures: number;
  readonly routingMismatches: number;
  readonly trueEscalations: number;
  readonly missedEscalations: number;
  readonly unnecessaryEscalations: number;
  readonly forbiddenClaimViolations: number;
  readonly promptInjectionFailures: number;
  readonly averageFastLatencyMs: number | null;
  readonly averageDeepLatencyMs: number | null;
  readonly totalProviderCalls: number;
}

export interface AiEvaluationReport {
  readonly evaluationVersion: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly options: Required<Pick<AiEvaluationRunOptions, 'mode' | 'runsPerFixture'>> & {
    readonly category?: string;
    readonly fixtureIds?: readonly string[];
  };
  readonly results: readonly AiFixtureEvaluationResult[];
  readonly summary: AiEvaluationSummary;
}

export interface AiEvaluationFixtureMetadata {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly hasFastExpectations: boolean;
  readonly hasRoutingExpectations: boolean;
  readonly hasDeepExpectations: boolean;
  readonly promptInjectionPresent: boolean;
  readonly manualReviewNotes: string;
}
