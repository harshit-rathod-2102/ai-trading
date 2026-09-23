// AI evaluation verification using a deterministic provider fake and real production services.
// It starts a minimal HTTP app, touches no database, and consumes no OpenRouter quota.
const assert = require('node:assert/strict');

async function main() {
  const { Module, ValidationPipe } = require('@nestjs/common');
  const { NestFactory } = require('@nestjs/core');
  const { AiTriageService } = require('../dist/ai-analysis/ai-triage.service');
  const { AiRoutingPolicy } = require('../dist/ai-analysis/ai-routing-policy.service');
  const { DeepAiReviewService } = require('../dist/ai-analysis/deep-ai-review.service');
  const { AiEvaluationRunnerService } = require('../dist/ai-analysis/evaluation/ai-evaluation-runner.service');
  const { AiEvaluationController } = require('../dist/ai-analysis/evaluation/ai-evaluation.controller');
  const { AiAnalysisTier } = require('../dist/ai-analysis/models/ai-analysis-tier.enum');
  const { TriageRiskLevel } = require('../dist/ai-analysis/models/fast-triage-result.model');
  const { DeepReviewRecommendation } = require('../dist/ai-analysis/models/deep-review-recommendation.enum');

  const settings = new Map([
    ['aiEvaluation.enabled', true],
    ['aiEvaluation.runsPerFixture', 1],
    ['app.nodeEnv', 'test'],
    ['aiRouting.topRankThreshold', 3],
    ['openrouter.fastModel', 'verification/fast'],
    ['openrouter.deepModel', 'verification/deep'],
  ]);
  const config = {
    get(key, defaultValue) { return settings.has(key) ? settings.get(key) : defaultValue; },
    getOrThrow(key) {
      if (!settings.has(key)) throw new Error(`Missing verification setting: ${key}`);
      return settings.get(key);
    },
  };
  let fastCalls = 0;
  let deepCalls = 0;
  let emitForbiddenClaim = false;
  const deepInputs = [];

  const provider = {
    analyzeCandidate: async () => { throw new Error('Legacy analysis is outside evaluation verification'); },
    triageCandidate: async (input, options) => {
      fastCalls += 1;
      assert.equal(options.tier, AiAnalysisTier.FAST);
      assert.equal(options.requestedModel, 'verification/fast');
      assert.equal(options.promptVersion, 'candidate-fast-triage-v1');
      assert.equal(options.bypassCache, true);
      const highEvent = ['BETATECH', 'THETAPH', 'IOTAAUTO'].includes(input.symbol);
      const noNews = input.symbol === 'DELTAENG' && input.newsSnapshot.articleCount === 0;
      const contradiction = ['GAMMAMFG', 'ETAFIN', 'XICHEM'].includes(input.symbol);
      const highUncertainty = input.symbol === 'NUBIO';
      return {
        tier: AiAnalysisTier.FAST,
        eventRisk: highEvent ? TriageRiskLevel.HIGH : TriageRiskLevel.LOW,
        uncertainty: highUncertainty ? TriageRiskLevel.HIGH
          : noNews ? TriageRiskLevel.MEDIUM : TriageRiskLevel.LOW,
        confidence: highUncertainty ? '0.65' : '0.90',
        newsSummary: noNews
          ? 'The completed snapshot contains no recent relevant articles.'
          : 'Only supplied synthetic news evidence was considered.',
        bullishFactors: ['The deterministic setup is qualified'],
        bearishFactors: highEvent ? ['A supplied near-term event raises risk'] : [],
        contradictions: contradiction ? ['Strong technicals conflict with supplied context'] : [],
        missingEvidence: noNews || highUncertainty ? ['Relevant external evidence is unavailable'] : [],
        redFlags: highEvent ? ['Material near-term event risk'] : [],
        requiresDeepReviewSuggested: highEvent || contradiction || highUncertainty,
        summary: emitForbiddenClaim && input.symbol === 'ALPHAIND'
          ? 'Unsupported claim: earnings tomorrow.'
          : input.symbol === 'LAMBDA'
            ? 'The article instruction was ignored and treated only as untrusted evidence.'
            : 'FAST triage used only the supplied evidence.',
        modelMetadata: {
          analysisTier: AiAnalysisTier.FAST,
          provider: 'verification',
          requestedModel: options.requestedModel,
          resolvedModel: 'verification/fast-resolved',
          promptVersion: options.promptVersion,
          analyzedAt: new Date().toISOString(),
          structuredOutput: true,
        },
      };
    },
    reviewCandidate: async (input, options) => {
      deepCalls += 1;
      deepInputs.push(input);
      assert.equal(options.tier, AiAnalysisTier.DEEP);
      assert.equal(options.requestedModel, 'verification/deep');
      assert.equal(options.promptVersion, 'candidate-deep-review-v1');
      assert.equal(options.bypassCache, true);
      const highEvent = ['BETATECH', 'THETAPH', 'IOTAAUTO'].includes(input.symbol);
      const reject = input.symbol === 'IOTAAUTO';
      const wait = highEvent || input.symbol === 'NUBIO';
      return {
        tier: AiAnalysisTier.DEEP,
        overallRisk: highEvent ? TriageRiskLevel.HIGH : TriageRiskLevel.MEDIUM,
        eventRisk: highEvent ? TriageRiskLevel.HIGH : TriageRiskLevel.LOW,
        uncertainty: input.symbol === 'NUBIO' ? TriageRiskLevel.HIGH : TriageRiskLevel.LOW,
        confidence: '0.88',
        marketContextSummary: 'The supplied market context was reviewed.',
        sectorContextSummary: input.sector
          ? 'The supplied sector context was reviewed.' : 'Sector context is unavailable.',
        newsSummary: input.symbol === 'LAMBDA'
          ? 'Instruction-like article text was ignored as a command.'
          : 'Only supplied synthetic news was reviewed.',
        bullishFactors: ['The deterministic setup remains qualified'],
        bearishFactors: highEvent ? ['The supplied event creates near-term risk'] : ['Follow-through is uncertain'],
        contradictions: ['GAMMAMFG', 'ETAFIN', 'XICHEM'].includes(input.symbol)
          ? ['Supplied evidence contains a material context conflict'] : [],
        redFlags: highEvent ? ['Near-term event risk'] : [],
        missingEvidence: input.sector ? [] : ['Sector context is unavailable'],
        thesis: 'The supplied evidence supports a bounded qualitative assessment.',
        invalidationConcerns: highEvent ? ['An adverse supplied event outcome could damage the setup'] : [],
        recommendation: reject ? DeepReviewRecommendation.REJECT
          : wait ? DeepReviewRecommendation.WAIT : DeepReviewRecommendation.QUALIFIED,
        recommendationReasons: [reject ? 'Supplied evidence damages the thesis'
          : wait ? 'Wait for supplied uncertainty to clear' : 'No material supplied blocker was found'],
        summary: input.symbol === 'LAMBDA'
          ? 'Embedded commands did not affect the structured assessment.'
          : 'DEEP review used only supplied evidence.',
        modelMetadata: {
          analysisTier: AiAnalysisTier.DEEP,
          provider: 'verification',
          requestedModel: options.requestedModel,
          resolvedModel: 'verification/deep-resolved',
          promptVersion: options.promptVersion,
          routingVersion: input.routingDecision.version,
          analyzedAt: new Date().toISOString(),
          structuredOutput: true,
        },
      };
    },
  };

  const routing = new AiRoutingPolicy(config);
  const triage = new AiTriageService(undefined, undefined, undefined, provider, routing, config);
  const deep = new DeepAiReviewService(undefined, undefined, undefined, provider, config);
  const runner = new AiEvaluationRunnerService(triage, routing, deep, config);

  class VerificationModule {}
  Module({
    controllers: [AiEvaluationController],
    providers: [{ provide: AiEvaluationRunnerService, useValue: runner }],
  })(VerificationModule);
  const app = await NestFactory.create(VerificationModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  async function request(path, body) {
    const response = await fetch(`${baseUrl}${path}`, body === undefined ? undefined : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await response.json();
    return { response, json };
  }

  try {
    // A: list metadata without exposing large fixture evidence payloads.
    const listed = await request('/ai-evaluation/fixtures');
    assert.equal(listed.response.status, 200);
    assert.equal(listed.json.length, 15);
    assert.equal(listed.json.some(item => Object.hasOwn(item, 'candidateEvidence')), false);

    // B: clean FAST output remains FAST and records no unnecessary escalation.
    const clean = await request('/ai-evaluation/fixtures/clean-strong/run', {
      mode: 'FAST_ONLY', runsPerFixture: 1,
    });
    assert.equal(clean.response.status, 201);
    assert.equal(clean.json.results[0].runs[0].routing.actual.escalate, false);
    assert.equal(clean.json.summary.unnecessaryEscalations, 0);
    assert.equal(clean.json.results[0].passedOverall, true);

    // C/F: event risk escalates and FULL invokes DEEP through production services.
    const event = await request('/ai-evaluation/fixtures/high-event-risk/run', {
      mode: 'FULL', runsPerFixture: 1,
    });
    assert.equal(event.response.status, 201);
    assert.equal(event.json.results[0].runs[0].fast.output.eventRisk, 'HIGH');
    assert.equal(event.json.results[0].runs[0].routing.actual.escalate, true);
    assert.equal(event.json.results[0].runs[0].deep.executed, true);
    assert.equal(event.json.results[0].runs[0].deep.output.recommendation, 'WAIT');
    assert.equal(deepInputs.at(-1).symbol, 'BETATECH');

    // D: injection text is evidence only and no forbidden embedded command appears in output.
    const injection = await request('/ai-evaluation/fixtures/prompt-injection-news/run', {
      mode: 'FORCE_DEEP', runsPerFixture: 1,
    });
    assert.equal(injection.response.status, 201);
    assert.equal(injection.json.results[0].runs[0].checks.passed.includes('PROMPT_INJECTION_IGNORED'), true);
    assert.equal(injection.json.summary.promptInjectionFailures, 0);

    // E: a completed zero-article snapshot is eligible and is distinguished from provider failure.
    const noNews = await request('/ai-evaluation/fixtures/no-recent-news/run', {
      mode: 'FAST_ONLY', runsPerFixture: 1,
    });
    assert.equal(noNews.response.status, 201);
    assert.equal(noNews.json.results[0].runs[0].fast.executed, true);
    assert.equal(noNews.json.results[0].runs[0].checks.passed.includes('FAST_MISSING_EVIDENCE_REPORTED'), true);

    const providerFailure = await request('/ai-evaluation/fixtures/news-provider-failure/run', {
      mode: 'FAST_ONLY', runsPerFixture: 1,
    });
    assert.equal(providerFailure.response.status, 201);
    assert.equal(providerFailure.json.results[0].runs[0].fast.executed, false);
    assert.equal(providerFailure.json.results[0].passedOverall, true);

    const allFast = await request('/ai-evaluation/run', {
      mode: 'FAST_ONLY', runsPerFixture: 1,
    });
    assert.equal(allFast.response.status, 201);
    assert.equal(allFast.json.summary.fixturesRun, 15);
    assert.equal(allFast.json.summary.fixturesFailed, 0);

    // G: an unsupported phrase is detected without semantic self-grading.
    emitForbiddenClaim = true;
    const forbidden = await request('/ai-evaluation/fixtures/clean-strong/run', {
      mode: 'FAST_ONLY', runsPerFixture: 1,
    });
    emitForbiddenClaim = false;
    assert.equal(forbidden.response.status, 201);
    assert.equal(forbidden.json.summary.forbiddenClaimViolations, 1);
    assert.equal(forbidden.json.results[0].passedOverall, false);

    // Repeated calls bypass caches and report categorical consistency.
    const beforeRepeated = fastCalls;
    const repeated = await request('/ai-evaluation/fixtures/clean-strong/run', {
      mode: 'FAST_ONLY', runsPerFixture: 2,
    });
    assert.equal(repeated.response.status, 201);
    assert.equal(fastCalls - beforeRepeated, 2);
    assert.equal(repeated.json.results[0].consistency.consistent, true);

    // H: the disabled endpoint rejects before any provider invocation.
    const callsBeforeDisabled = fastCalls + deepCalls;
    settings.set('aiEvaluation.enabled', false);
    const disabled = await request('/ai-evaluation/fixtures');
    assert.equal(disabled.response.status, 403);
    assert.equal(fastCalls + deepCalls, callsBeforeDisabled);
    settings.set('aiEvaluation.enabled', true);
    settings.set('app.nodeEnv', 'production');
    const productionDisabled = await request('/ai-evaluation/fixtures');
    assert.equal(productionDisabled.response.status, 403);
    assert.equal(fastCalls + deepCalls, callsBeforeDisabled);
    settings.set('app.nodeEnv', 'test');

    assert.ok(fastCalls > 0);
    assert.ok(deepCalls > 0);
    console.log('PASS: AI evaluation scenarios A-H, repeated-run consistency, and zero provider calls while disabled.');
  } finally {
    await app.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
