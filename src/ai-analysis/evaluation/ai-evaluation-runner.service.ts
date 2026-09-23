import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CANDIDATE_DEEP_REVIEW_PROMPT_VERSION } from '../../providers/ai/openrouter/prompts/candidate-deep-review-v1';
import { CANDIDATE_FAST_TRIAGE_PROMPT_VERSION } from '../../providers/ai/openrouter/prompts/candidate-fast-triage-v1';
import { ProviderError, ProviderErrorCode } from '../../providers/provider-error';
import { buildDeepReviewInput, buildFastTriageInput } from '../ai-evidence-builder';
import { AiRoutingPolicy } from '../ai-routing-policy.service';
import { AiTriageService } from '../ai-triage.service';
import { AI_ROUTING_V1_CONFIG } from '../config/ai-routing-v1.config';
import { DeepAiReviewService } from '../deep-ai-review.service';
import { AiAnalysisTier } from '../models/ai-analysis-tier.enum';
import { AiRoutingDecision } from '../models/ai-routing-decision.model';
import { DeepReviewResult } from '../models/deep-review-result.model';
import { EscalationReason } from '../models/escalation-reason.enum';
import { FastTriageResult } from '../models/fast-triage-result.model';
import { scoreEvaluationRun } from './ai-evaluation-scoring';
import {
  AiEvaluationFixture,
  AiEvaluationFixtureMetadata,
  AiEvaluationMode,
  AiEvaluationReport,
  AiEvaluationRunOptions,
  AiEvaluationSummary,
  AiFixtureEvaluationResult,
  AiFixtureRunResult,
} from './ai-evaluation.types';
import { AI_EVALUATION_FIXTURES } from './fixtures/ai-evaluation-fixtures';

const EVALUATION_VERSION = 'ai-evaluation-v1';
const MAX_RUNS_PER_FIXTURE = 5;

@Injectable()
export class AiEvaluationRunnerService {
  private readonly logger = new Logger(AiEvaluationRunnerService.name);

  constructor(
    private readonly triage: AiTriageService,
    private readonly routing: AiRoutingPolicy,
    private readonly deepReview: DeepAiReviewService,
    private readonly config: ConfigService,
  ) {}

  listFixtures(): readonly AiEvaluationFixtureMetadata[] {
    this.ensureEnabled();
    return AI_EVALUATION_FIXTURES.map((fixture) => ({
      id: fixture.id,
      name: fixture.name,
      description: fixture.description,
      category: fixture.category,
      hasFastExpectations: Boolean(fixture.expectations.fast),
      hasRoutingExpectations: Boolean(fixture.expectations.routing),
      hasDeepExpectations: Boolean(fixture.expectations.deep),
      promptInjectionPresent: Boolean(fixture.expectations.safety.promptInjectionPresent),
      manualReviewNotes: fixture.manualReviewNotes,
    }));
  }

  runFixture(
    fixtureId: string,
    options: Partial<AiEvaluationRunOptions> = {},
  ): Promise<AiEvaluationReport> {
    return this.run({ ...options, fixtureIds: [fixtureId] });
  }

  runAll(options: Partial<AiEvaluationRunOptions> = {}): Promise<AiEvaluationReport> {
    return this.run(options);
  }

  async run(options: Partial<AiEvaluationRunOptions> = {}): Promise<AiEvaluationReport> {
    this.ensureEnabled();
    const normalized = this.normalizeOptions(options);
    const fixtures = this.selectFixtures(normalized);
    const startedAt = new Date();
    this.logger.log(
      {
        event: 'ai.evaluation.started',
        evaluationVersion: EVALUATION_VERSION,
        mode: normalized.mode,
        runsPerFixture: normalized.runsPerFixture,
        fixtureCount: fixtures.length,
      },
      'AI evaluation started',
    );

    try {
      const results: AiFixtureEvaluationResult[] = [];
      for (const fixture of fixtures) {
        const result = await this.evaluateFixture(
          fixture,
          normalized.mode,
          normalized.runsPerFixture,
        );
        results.push(result);
      }

      const report: AiEvaluationReport = {
        evaluationVersion: EVALUATION_VERSION,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        options: normalized,
        results,
        summary: summarize(results),
      };
      this.logger.log(
        {
          event: 'ai.evaluation.completed',
          evaluationVersion: EVALUATION_VERSION,
          mode: normalized.mode,
          ...report.summary,
        },
        'AI evaluation completed',
      );
      return report;
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'ai.evaluation.failed',
          evaluationVersion: EVALUATION_VERSION,
          mode: normalized.mode,
          error: safeError(error),
        },
        'AI evaluation failed',
      );
      throw error;
    }
  }

  private async evaluateFixture(
    fixture: AiEvaluationFixture,
    mode: AiEvaluationMode,
    runsPerFixture: number,
  ): Promise<AiFixtureEvaluationResult> {
    const runs: AiFixtureRunResult[] = [];
    for (let runNumber = 1; runNumber <= runsPerFixture; runNumber += 1) {
      const started = performance.now();
      this.logger.log(
        {
          event: 'ai.evaluation.fixture.started',
          fixtureId: fixture.id,
          category: fixture.category,
          mode,
          runNumber,
          fastRequestedModel: this.config.get<string>('openrouter.fastModel'),
          deepRequestedModel: this.config.get<string>('openrouter.deepModel'),
        },
        'AI evaluation fixture run started',
      );
      const run = await this.evaluateRun(fixture, mode, runNumber);
      runs.push(run);
      const logFields = {
        fixtureId: fixture.id,
        category: fixture.category,
        mode,
        runNumber,
        passed: run.passedOverall,
        durationMs: elapsed(started),
        fastRequestedModel: run.fast.output?.modelMetadata.requestedModel,
        fastResolvedModel: run.fast.output?.modelMetadata.resolvedModel,
        deepRequestedModel: run.deep.output?.modelMetadata.requestedModel,
        deepResolvedModel: run.deep.output?.modelMetadata.resolvedModel,
      };
      if (run.passedOverall) {
        this.logger.log(
          { event: 'ai.evaluation.fixture.completed', ...logFields },
          'AI evaluation fixture run completed',
        );
      } else {
        this.logger.warn(
          {
            event: 'ai.evaluation.fixture.failed',
            ...logFields,
            failedChecks: run.checks.failed,
          },
          'AI evaluation fixture run failed checks',
        );
      }
    }
    const consistency = evaluateConsistency(runs);
    return {
      fixtureId: fixture.id,
      fixtureName: fixture.name,
      category: fixture.category,
      mode,
      promptVersions: {
        fast: CANDIDATE_FAST_TRIAGE_PROMPT_VERSION,
        deep: CANDIDATE_DEEP_REVIEW_PROMPT_VERSION,
        routing: AI_ROUTING_V1_CONFIG.version,
      },
      runs,
      consistency,
      passedOverall: runs.every((run) => run.passedOverall),
      allowedFacts: fixture.allowedFacts,
      manualReviewNotes: fixture.manualReviewNotes,
    };
  }

  private async evaluateRun(
    fixture: AiEvaluationFixture,
    mode: AiEvaluationMode,
    runNumber: number,
  ): Promise<AiFixtureRunResult> {
    let evidenceEligible = true;
    let fast: FastTriageResult | undefined;
    let fastError: string | undefined;
    let fastSchemaFailure = false;
    let fastDurationMs: number | undefined;
    let fastProviderCalled = false;
    try {
      const input = buildFastTriageInput(
        fixture.candidateEvidence,
        fixture.candidateEvidence.companyName,
      );
      const started = performance.now();
      fastProviderCalled = true;
      fast = await this.triage.analyzeEvidence(input, true);
      fastDurationMs = elapsed(started);
    } catch (error: unknown) {
      if (!fastProviderCalled) evidenceEligible = false;
      fastSchemaFailure = isProviderSchemaFailure(error);
      fastError = safeError(error);
    }

    const routing = fast
      ? this.routing.decide(fast, {
          strategyRank: fixture.candidateEvidence.strategyRank as number,
          globalRank: fixture.candidateEvidence.globalRank as number,
        })
      : undefined;

    const deepExpectedToRun = Boolean(
      fast &&
      (mode === AiEvaluationMode.FORCE_DEEP ||
        (mode === AiEvaluationMode.FULL && routing?.escalate)),
    );
    let deep: DeepReviewResult | undefined;
    let deepError: string | undefined;
    let deepSchemaFailure = false;
    let deepDurationMs: number | undefined;
    let deepProviderCalled = false;
    if (fast && routing && deepExpectedToRun) {
      const routingForInput =
        mode === AiEvaluationMode.FORCE_DEEP && !routing.escalate
          ? forceDeepRouting(routing)
          : routing;
      try {
        const input = buildDeepReviewInput(
          fixture.candidateEvidence,
          fixture.candidateEvidence.companyName,
          fast,
          routingForInput,
        );
        const started = performance.now();
        deepProviderCalled = true;
        deep = await this.deepReview.analyzeEvidence(input, true);
        deepDurationMs = elapsed(started);
      } catch (error: unknown) {
        deepSchemaFailure = isProviderSchemaFailure(error);
        deepError = safeError(error);
      }
    }

    const checks = scoreEvaluationRun({
      fixture,
      mode,
      evidenceEligible,
      fast,
      fastError,
      fastSchemaFailure,
      routing,
      deep,
      deepExpectedToRun,
      deepError,
      deepSchemaFailure,
    });
    const expectedRouting = fixture.expectations.routing;
    const missingExpectedReasons =
      expectedRouting && routing
        ? (expectedRouting.mustIncludeReasons ?? []).filter(
            (reason) => !routing.reasons.includes(reason),
          )
        : [];
    return {
      runNumber,
      fast: {
        executed: fastProviderCalled,
        success: Boolean(fast),
        parsedSuccessfully: Boolean(fast),
        schemaValid: checks.passed.includes('FAST_SCHEMA_VALID'),
        requiredFieldsPresent: checks.passed.includes('FAST_SCHEMA_VALID'),
        ...(fast ? { output: fast } : {}),
        ...(fastDurationMs === undefined ? {} : { durationMs: fastDurationMs }),
        ...(fastError ? { error: fastError } : {}),
      },
      ...(routing
        ? {
            routing: {
              actual: routing,
              expectedMatch: !checks.failed.some((check) => check.startsWith('ROUTING_')),
              missingExpectedReasons,
            },
          }
        : {}),
      deep: {
        executed: deepProviderCalled,
        ...(deepProviderCalled
          ? {
              success: Boolean(deep),
              parsedSuccessfully: Boolean(deep),
              schemaValid: deep ? checks.passed.includes('DEEP_SCHEMA_VALID') : false,
              requiredFieldsPresent: deep ? checks.passed.includes('DEEP_SCHEMA_VALID') : false,
            }
          : {}),
        ...(deep
          ? {
              output: deep,
            }
          : {}),
        ...(deepDurationMs === undefined ? {} : { durationMs: deepDurationMs }),
        ...(deepError ? { error: deepError } : {}),
      },
      checks,
      modelMetadata: {
        ...(fast ? { fast: fast.modelMetadata } : {}),
        ...(deep ? { deep: deep.modelMetadata } : {}),
      },
      passedOverall: checks.failed.length === 0,
    };
  }

  private normalizeOptions(options: Partial<AiEvaluationRunOptions>): {
    readonly mode: AiEvaluationMode;
    readonly runsPerFixture: number;
    readonly category?: string;
    readonly fixtureIds?: readonly string[];
  } {
    const mode = options.mode ?? AiEvaluationMode.FAST_ONLY;
    if (!Object.values(AiEvaluationMode).includes(mode)) {
      throw new BadRequestException(`Unsupported evaluation mode: ${String(mode)}`);
    }
    const runsPerFixture =
      options.runsPerFixture ?? this.config.get<number>('aiEvaluation.runsPerFixture', 1);
    if (
      !Number.isInteger(runsPerFixture) ||
      runsPerFixture < 1 ||
      runsPerFixture > MAX_RUNS_PER_FIXTURE
    ) {
      throw new BadRequestException(
        `runsPerFixture must be an integer from 1 through ${MAX_RUNS_PER_FIXTURE}`,
      );
    }
    return {
      mode,
      runsPerFixture,
      ...(options.category?.trim() ? { category: options.category.trim() } : {}),
      ...(options.fixtureIds?.length ? { fixtureIds: [...new Set(options.fixtureIds)] } : {}),
    };
  }

  private selectFixtures(options: {
    readonly category?: string;
    readonly fixtureIds?: readonly string[];
  }): readonly AiEvaluationFixture[] {
    if (options.fixtureIds) {
      const unknown = options.fixtureIds.filter(
        (id) => !AI_EVALUATION_FIXTURES.some((fixture) => fixture.id === id),
      );
      if (unknown.length)
        throw new NotFoundException(`Unknown AI evaluation fixture(s): ${unknown.join(', ')}`);
    }
    const selected = AI_EVALUATION_FIXTURES.filter(
      (fixture) =>
        (!options.category || fixture.category === options.category) &&
        (!options.fixtureIds || options.fixtureIds.includes(fixture.id)),
    );
    if (!selected.length)
      throw new NotFoundException('No AI evaluation fixtures matched the requested subset');
    return selected;
  }

  private ensureEnabled(): void {
    if (
      this.config.get<string>('app.nodeEnv') === 'production' ||
      !this.config.get<boolean>('aiEvaluation.enabled', false)
    ) {
      throw new ForbiddenException(
        'AI evaluation is disabled; it requires AI_EVALUATION_ENABLED=true outside production',
      );
    }
  }
}

function forceDeepRouting(routing: AiRoutingDecision): AiRoutingDecision {
  return {
    ...routing,
    escalate: true,
    tierSelected: AiAnalysisTier.DEEP,
    reasons: routing.reasons.length
      ? routing.reasons
      : [EscalationReason.MODEL_REQUESTED_ESCALATION],
  };
}

function evaluateConsistency(runs: readonly AiFixtureRunResult[]): {
  readonly consistent: boolean;
  readonly changedFields: readonly string[];
} {
  if (runs.length < 2) return { consistent: true, changedFields: [] };
  const fields: Array<[string, (run: AiFixtureRunResult) => unknown]> = [
    ['fast.eventRisk', (run) => run.fast.output?.eventRisk],
    ['fast.uncertainty', (run) => run.fast.output?.uncertainty],
    ['fast.requiresDeepReviewSuggested', (run) => run.fast.output?.requiresDeepReviewSuggested],
    ['routing.escalate', (run) => run.routing?.actual.escalate],
    ['routing.reasons', (run) => run.routing?.actual.reasons.join('|')],
    ['deep.recommendation', (run) => run.deep.output?.recommendation],
    ['deep.eventRisk', (run) => run.deep.output?.eventRisk],
  ];
  const changedFields = fields
    .filter(([, getter]) => runs.slice(1).some((run) => getter(run) !== getter(runs[0])))
    .map(([name]) => name);
  return { consistent: changedFields.length === 0, changedFields };
}

function summarize(results: readonly AiFixtureEvaluationResult[]): AiEvaluationSummary {
  const runs = results.flatMap((result) => result.runs);
  const allFailures = runs.flatMap((run) => run.checks.failed);
  const fastLatencies = runs.flatMap((run) =>
    run.fast.durationMs === undefined ? [] : [run.fast.durationMs],
  );
  const deepLatencies = runs.flatMap((run) =>
    run.deep.durationMs === undefined ? [] : [run.deep.durationMs],
  );
  let missedEscalations = 0;
  let unnecessaryEscalations = 0;
  let trueEscalations = 0;
  for (const result of results) {
    const expected = AI_EVALUATION_FIXTURES.find((fixture) => fixture.id === result.fixtureId)
      ?.expectations.routing;
    if (!expected) continue;
    for (const run of result.runs) {
      if (expected.escalate && run.routing?.actual.escalate) trueEscalations += 1;
      if (expected.escalate && run.routing && !run.routing.actual.escalate) missedEscalations += 1;
      if (!expected.escalate && run.routing?.actual.escalate) unnecessaryEscalations += 1;
    }
  }
  return {
    fixturesRun: results.length,
    fixturesPassed: results.filter((result) => result.passedOverall).length,
    fixturesFailed: results.filter((result) => !result.passedOverall).length,
    fastSchemaFailures: allFailures.filter((check) => check === 'FAST_SCHEMA_VALID').length,
    deepSchemaFailures: allFailures.filter((check) => check === 'DEEP_SCHEMA_VALID').length,
    routingMismatches: allFailures.filter((check) => check === 'ROUTING_ESCALATION_EXPECTED')
      .length,
    trueEscalations,
    missedEscalations,
    unnecessaryEscalations,
    forbiddenClaimViolations: allFailures.filter((check) => check.startsWith('FORBIDDEN_CLAIM:'))
      .length,
    promptInjectionFailures: allFailures.filter((check) => check === 'PROMPT_INJECTION_IGNORED')
      .length,
    averageFastLatencyMs: average(fastLatencies),
    averageDeepLatencyMs: average(deepLatencies),
    totalProviderCalls: runs.reduce(
      (total, run) => total + Number(run.fast.executed) + Number(run.deep.executed),
      0,
    ),
  };
}

function average(values: readonly number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function elapsed(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function safeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return 'Unknown evaluation error';
}

function isProviderSchemaFailure(error: unknown): boolean {
  return error instanceof ProviderError && error.code === ProviderErrorCode.INVALID_RESPONSE;
}
