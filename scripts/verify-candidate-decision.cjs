// Database-backed final candidate decision verification. No AI/news provider calls are made.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');

if (existsSync('.env')) process.loadEnvFile('.env');

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { DataSource } = require('typeorm');
  const { AppModule } = require('../dist/app.module');
  const { TradeCandidate } = require('../dist/candidates/entities/trade-candidate.entity');
  const { Instrument } = require('../dist/instruments/entities/instrument.entity');
  const { CandidateStatus } = require('../dist/common/enums/candidate-status.enum');
  const { InstrumentType } = require('../dist/common/enums/instrument-type.enum');
  const { AiAnalysisTier } = require('../dist/ai-analysis/models/ai-analysis-tier.enum');
  const { TriageRiskLevel } = require('../dist/ai-analysis/models/fast-triage-result.model');
  const { DeepReviewRecommendation } = require('../dist/ai-analysis/models/deep-review-recommendation.enum');
  const { EscalationReason } = require('../dist/ai-analysis/models/escalation-reason.enum');
  const { fastEvidenceHash, deepEvidenceHash } = require('../dist/ai-analysis/ai-evidence-hash');

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  const apiBase = `http://127.0.0.1:${address.port}/api`;
  const dataSource = app.get(DataSource);
  const candidates = dataSource.getRepository(TradeCandidate);
  const instruments = dataSource.getRepository(Instrument);
  const runId = randomUUID();
  const candidateIds = [];
  const resultIds = [];
  const instrumentIds = [];

  function fastResult(overrides = {}) {
    return {
      tier: AiAnalysisTier.FAST,
      eventRisk: TriageRiskLevel.LOW,
      uncertainty: TriageRiskLevel.LOW,
      confidence: '0.92',
      newsSummary: 'Only the persisted verification evidence was used.',
      bullishFactors: ['The deterministic setup remains qualified'],
      bearishFactors: [],
      contradictions: [],
      missingEvidence: [],
      redFlags: [],
      requiresDeepReviewSuggested: false,
      summary: 'No material qualitative issue was identified.',
      modelMetadata: {
        analysisTier: AiAnalysisTier.FAST,
        provider: 'verification',
        requestedModel: 'verification/fast',
        resolvedModel: 'verification/fast',
        promptVersion: 'candidate-fast-triage-v1',
        routingVersion: 'ai-routing-v1',
        analyzedAt: new Date().toISOString(),
        structuredOutput: true,
      },
      ...overrides,
    };
  }

  function routingDecision(escalate, reasons = []) {
    return {
      version: 'ai-routing-v1',
      escalate,
      reasons,
      tierSelected: escalate ? AiAnalysisTier.DEEP : AiAnalysisTier.FAST,
      decidedAt: new Date().toISOString(),
      topRankThreshold: 3,
    };
  }

  function deepResult(recommendation, overrides = {}) {
    return {
      tier: AiAnalysisTier.DEEP,
      overallRisk: recommendation === DeepReviewRecommendation.QUALIFIED
        ? TriageRiskLevel.LOW : TriageRiskLevel.HIGH,
      eventRisk: recommendation === DeepReviewRecommendation.QUALIFIED
        ? TriageRiskLevel.LOW : TriageRiskLevel.HIGH,
      uncertainty: recommendation === DeepReviewRecommendation.WAIT
        ? TriageRiskLevel.HIGH : TriageRiskLevel.LOW,
      confidence: '0.89',
      marketContextSummary: 'Persisted market context was reviewed.',
      sectorContextSummary: 'Persisted sector context was reviewed.',
      newsSummary: 'Only persisted verification news was reviewed.',
      bullishFactors: ['The deterministic setup remains valid'],
      bearishFactors: recommendation === DeepReviewRecommendation.QUALIFIED
        ? ['Follow-through is not guaranteed'] : ['Supplied qualitative evidence raises material concern'],
      contradictions: [],
      redFlags: recommendation === DeepReviewRecommendation.REJECT
        ? ['Supplied evidence materially undermines the thesis'] : [],
      missingEvidence: [],
      thesis: 'The assessment is limited to persisted evidence.',
      invalidationConcerns: ['The supplied evidence defines the qualitative limit'],
      recommendation,
      recommendationReasons: [recommendation === DeepReviewRecommendation.QUALIFIED
        ? 'No material qualitative blocker remains'
        : recommendation === DeepReviewRecommendation.WAIT
          ? 'Near-term uncertainty should clear before presentation'
          : 'Supplied qualitative evidence materially damages the thesis'],
      summary: 'DEEP verification review completed.',
      modelMetadata: {
        analysisTier: AiAnalysisTier.DEEP,
        provider: 'verification',
        requestedModel: 'verification/deep',
        resolvedModel: 'verification/deep',
        promptVersion: 'candidate-deep-review-v1',
        routingVersion: 'ai-routing-v1',
        analyzedAt: new Date().toISOString(),
        structuredOutput: true,
      },
      ...overrides,
    };
  }

  async function createCandidate(prefix, options = {}) {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
    const symbol = `${prefix}${suffix}`.slice(0, 32);
    const instrumentId = randomUUID();
    const scanResultId = randomUUID();
    const candidateId = randomUUID();
    const companyName = `${prefix} Decision Verification Limited`;
    instrumentIds.push(instrumentId);
    resultIds.push(scanResultId);
    candidateIds.push(candidateId);

    await instruments.save(instruments.create({
      id: instrumentId,
      symbol,
      exchange: 'NSE',
      name: companyName,
      type: InstrumentType.EQUITY,
      sector: 'Verification',
      industry: 'Testing',
      provider: 'fixture',
      providerInstrumentId: `decision:${instrumentId}`,
      providerSymbol: symbol,
      providerMetadata: { verification: true },
      isActive: true,
    }));

    const technicalSnapshot = { close: '100.0000', sma20: '96.0000', trend: 'UP' };
    const strategySnapshot = {
      qualified: true,
      strategy: 'MOMENTUM_BREAKOUT',
      strategyVersion: 'decision-verification-v1',
      score: '90.0000',
    };
    const rankingSnapshot = {
      strategyRank: 8,
      globalRank: 8,
      rankingFeatures: { momentum: '0.90', sectorStrength: 'POSITIVE' },
    };
    await dataSource.query(
      `INSERT INTO scan_results (
        id, scan_run_id, instrument_id, symbol, exchange, sector, strategy, strategy_version,
        strategy_score, ranking_score, global_ranking_score, strategy_rank,
        strategy_qualified_count, global_rank, global_qualified_count, technical_snapshot,
        strategy_result, ranking_features, is_shortlisted
      ) VALUES ($1,$2,$3,$4,'NSE','Verification','MOMENTUM_BREAKOUT','decision-verification-v1',
        90,89,88,8,20,8,40,$5,$6,$7,TRUE)`,
      [scanResultId, runId, instrumentId, symbol, technicalSnapshot, strategySnapshot,
        rankingSnapshot.rankingFeatures],
    );
    const now = new Date();
    const newsSnapshot = options.newsFailure ? null : {
      version: 'candidate-news-v1',
      provider: 'verification',
      queries: [`${symbol} company news`],
      lookbackDays: 7,
      fetchedAt: now.toISOString(),
      articleCount: options.zeroNews ? 0 : 1,
      articles: options.zeroNews ? [] : [{
        articleId: `decision:${candidateId}`,
        title: `${prefix} routine update`,
        description: 'Persisted synthetic evidence only.',
        url: `https://news.example/${candidateId}`,
        source: 'Decision Verification',
        publishedAt: now.toISOString(),
        author: null,
        imageUrl: null,
      }],
      warnings: options.zeroNews ? ['No recent relevant articles were returned.'] : [],
      providerMetadata: { resultCount: options.zeroNews ? 0 : 1 },
    };
    let candidate = await candidates.save(candidates.create({
      id: candidateId,
      scanRunId: runId,
      scanResultId,
      marketDate: now.toISOString().slice(0, 10),
      scannerVersion: 'decision-verification-v1',
      symbol,
      exchange: 'NSE',
      sector: 'Verification',
      strategy: 'MOMENTUM_BREAKOUT',
      strategyVersion: 'decision-verification-v1',
      status: options.status || CandidateStatus.NEW,
      detectedAt: now,
      proposedEntry: '100.0000',
      proposedStop: '95.0000',
      target1: '110.0000',
      target2: '115.0000',
      suggestedQuantity: 10,
      quantScore: '90.0000',
      strategyScore: '90.0000',
      rankingScore: '89.0000',
      globalRankingScore: '88.0000',
      strategyRank: 8,
      strategyQualifiedCount: 20,
      globalRank: 8,
      globalQualifiedCount: 40,
      technicalSnapshot,
      riskSnapshot: { riskVersion: 'risk-v1', accepted: true, recommendedQuantity: 10 },
      marketRegimeSnapshot: { version: 'market-regime-v1', regime: 'BULLISH' },
      strategySnapshot,
      rankingSnapshot,
      newsSnapshot,
      newsEnrichedAt: newsSnapshot ? now : null,
      aiAnalysis: null,
      decisionSnapshot: null,
      decidedAt: null,
    }));

    if (options.malformedFast) {
      candidate.aiAnalysis = { fast: { errorCode: 'PROVIDER_TIMEOUT' } };
      return candidates.save(candidate);
    }
    if (options.noFast || options.newsFailure || options.status) return candidate;

    const fast = options.fast || fastResult();
    const routing = options.routing || routingDecision(false);
    const fastHash = fastEvidenceHash(candidate, companyName, 'candidate-fast-triage-v1');
    const aiAnalysis = { fast: { ...fast, evidenceHash: fastHash }, routing, deep: null };
    if (options.deepRecommendation) {
      const deep = deepResult(options.deepRecommendation);
      const deepHash = deepEvidenceHash(
        candidate, companyName, fast, routing, 'candidate-deep-review-v1',
      );
      aiAnalysis.deep = { ...deep, evidenceHash: deepHash };
    }
    candidate.aiAnalysis = aiAnalysis;
    candidate = await candidates.save(candidate);
    return candidate;
  }

  async function finalize(candidateId) {
    const response = await fetch(`${apiBase}/candidates/${candidateId}/finalize`, { method: 'POST' });
    return { status: response.status, body: await response.json() };
  }

  try {
    await dataSource.query(
      `INSERT INTO scan_runs (
        id, market_date, scanner_version, universe_code, execution_key, status, market_regime_snapshot,
        total_universe, eligible_universe, evaluated_symbols, qualified_setups,
        shortlisted_setups, started_at, completed_at
      ) VALUES ($1,CURRENT_DATE,$2,'DEVELOPMENT','verify','SUCCESS',$3,30,30,30,20,20,NOW(),NOW())`,
      [runId, `verify-decision-${randomUUID().slice(0, 8)}`,
        { version: 'market-regime-v1', regime: 'BULLISH' }],
    );

    // A/L: deterministic selection qualifies without changing risk or trade parameters.
    const fastClean = await createCandidate('FASTCLEAN', { zeroNews: true });
    const beforeParameters = {
      proposedEntry: fastClean.proposedEntry,
      proposedStop: fastClean.proposedStop,
      target1: fastClean.target1,
      target2: fastClean.target2,
      suggestedQuantity: fastClean.suggestedQuantity,
      riskSnapshot: fastClean.riskSnapshot,
    };
    const fastDecision = await finalize(fastClean.id);
    assert.equal(fastDecision.status, 200);
    assert.equal(fastDecision.body.finalized, true);
    assert.equal(fastDecision.body.outcome, 'QUALIFIED');
    assert.equal(fastDecision.body.sourceTier, 'DETERMINISTIC');
    const fastPersisted = await candidates.findOneByOrFail({ id: fastClean.id });
    assert.equal(fastPersisted.status, CandidateStatus.QUALIFIED);
    assert.equal(fastPersisted.decisionSnapshot.version, 'candidate-decision-v1');
    assert.deepEqual({
      proposedEntry: fastPersisted.proposedEntry,
      proposedStop: fastPersisted.proposedStop,
      target1: fastPersisted.target1,
      target2: fastPersisted.target2,
      suggestedQuantity: fastPersisted.suggestedQuantity,
      riskSnapshot: fastPersisted.riskSnapshot,
    }, beforeParameters);

    // B-D: DEEP recommendations are advisory and cannot override deterministic qualification.
    for (const [prefix, recommendation] of [
      ['DEEPQUAL', DeepReviewRecommendation.QUALIFIED],
      ['DEEPWAIT', DeepReviewRecommendation.WAIT],
      ['DEEPREJ', DeepReviewRecommendation.REJECT],
    ]) {
      const highEvent = recommendation !== DeepReviewRecommendation.QUALIFIED;
      const fast = fastResult({
        eventRisk: highEvent ? TriageRiskLevel.HIGH : TriageRiskLevel.LOW,
        requiresDeepReviewSuggested: !highEvent,
        redFlags: highEvent ? ['Supplied event risk requires review'] : [],
      });
      const routing = highEvent
        ? routingDecision(true, [EscalationReason.HIGH_EVENT_RISK])
        : routingDecision(true, [EscalationReason.MODEL_REQUESTED_ESCALATION]);
      const candidate = await createCandidate(prefix, { fast, routing, deepRecommendation: recommendation });
      const response = await finalize(candidate.id);
      assert.equal(response.status, 200);
      assert.equal(response.body.outcome, CandidateStatus.QUALIFIED);
      assert.equal(response.body.sourceTier, 'DETERMINISTIC');
      const persisted = await candidates.findOneByOrFail({ id: candidate.id });
      assert.equal(persisted.status, CandidateStatus.QUALIFIED);
      const events = await dataSource.query(
        'SELECT event_type, source FROM trade_events WHERE candidate_id=$1 AND event_type=$2',
        [candidate.id, 'CANDIDATE_QUALIFIED'],
      );
      assert.equal(events.length, 1);
      assert.equal(events[0].source, 'SYSTEM');
    }

    // E: missing DEEP evidence is advisory and does not block deterministic qualification.
    const deepRequired = await createCandidate('DEEPREQ', {
      fast: fastResult({ eventRisk: TriageRiskLevel.HIGH }),
      routing: routingDecision(true, [EscalationReason.HIGH_EVENT_RISK]),
    });
    assert.equal((await finalize(deepRequired.id)).body.outcome, CandidateStatus.QUALIFIED);
    assert.equal((await candidates.findOneByOrFail({ id: deepRequired.id })).status, CandidateStatus.QUALIFIED);

    // F-H: missing FAST, failed news, and malformed AI evidence are advisory.
    const noFast = await createCandidate('NOFAST', { noFast: true });
    assert.equal((await finalize(noFast.id)).body.outcome, CandidateStatus.QUALIFIED);
    const newsFailure = await createCandidate('NEWSFAIL', { newsFailure: true });
    assert.equal((await finalize(newsFailure.id)).body.outcome, CandidateStatus.QUALIFIED);
    const providerFailure = await createCandidate('AIFAIL', { malformedFast: true });
    assert.equal((await finalize(providerFailure.id)).body.outcome, CandidateStatus.QUALIFIED);
    for (const candidate of [noFast, newsFailure, providerFailure]) {
      assert.equal((await candidates.findOneByOrFail({ id: candidate.id })).status, CandidateStatus.QUALIFIED);
    }

    // I: inconsistent qualitative routing is advisory and cannot block qualification.
    const inconsistent = await createCandidate('POLICY', {
      fast: fastResult({ eventRisk: TriageRiskLevel.HIGH }),
      routing: routingDecision(false),
    });
    assert.equal((await finalize(inconsistent.id)).body.outcome, CandidateStatus.QUALIFIED);
    assert.equal((await candidates.findOneByOrFail({ id: inconsistent.id })).status, CandidateStatus.QUALIFIED);

    // J: repeated finalization returns the stored result and creates one final-decision event.
    const duplicate = await finalize(fastClean.id);
    assert.equal(duplicate.body.reusedExistingDecision, true);
    assert.equal(duplicate.body.decidedAt, fastDecision.body.decidedAt);
    const decisionEvents = await dataSource.query(
      `SELECT event_type FROM trade_events WHERE candidate_id=$1
       AND event_type IN ('CANDIDATE_QUALIFIED','CANDIDATE_WAIT','CANDIDATE_REJECTED')`,
      [fastClean.id],
    );
    assert.equal(decisionEvents.length, 1);

    // K: terminal candidates with no prior decision cannot transition into a final AI state.
    for (const status of [CandidateStatus.ACCEPTED, CandidateStatus.SKIPPED, CandidateStatus.EXPIRED]) {
      const terminal = await createCandidate(`TERM${status.slice(0, 3)}`, { status });
      const response = await finalize(terminal.id);
      assert.equal(response.status, 409);
      assert.equal(response.body.code, 'INVALID_STATE_TRANSITION');
      assert.equal((await candidates.findOneByOrFail({ id: terminal.id })).status, status);
    }

    const tradeCount = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM trades WHERE candidate_id = ANY($1::uuid[])',
      [candidateIds],
    );
    assert.equal(tradeCount[0].count, 0);
    console.log('PASS: final candidate decision scenarios A-L, transactional events, idempotency, and parameter integrity.');
  } finally {
    if (candidateIds.length) {
      await dataSource.query('DELETE FROM trade_events WHERE candidate_id = ANY($1::uuid[])', [candidateIds]);
      await dataSource.query('DELETE FROM trade_candidates WHERE id = ANY($1::uuid[])', [candidateIds]);
    }
    if (resultIds.length) await dataSource.query('DELETE FROM scan_results WHERE id = ANY($1::uuid[])', [resultIds]);
    await dataSource.query('DELETE FROM scan_runs WHERE id=$1', [runId]);
    if (instrumentIds.length) await dataSource.query('DELETE FROM instruments WHERE id = ANY($1::uuid[])', [instrumentIds]);
    await app.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
