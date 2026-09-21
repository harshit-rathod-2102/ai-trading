// FAST triage verification with a provider fake and real PostgreSQL persistence.
// This intentionally avoids spending OpenRouter quota and never executes DEEP analysis.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');

if (existsSync('.env')) process.loadEnvFile('.env');

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { ConfigService } = require('@nestjs/config');
  const { DataSource } = require('typeorm');
  const { AppModule } = require('../dist/app.module');
  const { AiTriageService } = require('../dist/ai-analysis/ai-triage.service');
  const { AiRoutingPolicy } = require('../dist/ai-analysis/ai-routing-policy.service');
  const { AiAnalysisTier } = require('../dist/ai-analysis/models/ai-analysis-tier.enum');
  const { TriageRiskLevel } = require('../dist/ai-analysis/models/fast-triage-result.model');
  const { TradeCandidate } = require('../dist/candidates/entities/trade-candidate.entity');
  const { Instrument } = require('../dist/instruments/entities/instrument.entity');
  const { CandidateStatus } = require('../dist/common/enums/candidate-status.enum');
  const { InstrumentType } = require('../dist/common/enums/instrument-type.enum');
  const { ProviderTimeoutError, ProviderErrorCode } = require('../dist/providers/provider-error');
  const { mapOpenRouterFastTriage } = require('../dist/providers/ai/openrouter/mappers/openrouter-fast-triage.mapper');
  const { OpenRouterAiProvider } = require('../dist/providers/ai/openrouter/openrouter-ai.provider');
  const { OpenRouterStructuredOutputUnsupportedError } = require('../dist/providers/ai/openrouter/openrouter-client');

  const context = await NestFactory.create(AppModule, { logger: false });
  await context.listen(0, '127.0.0.1');
  const address = context.getHttpServer().address();
  const apiBase = process.env.VERIFY_API_URL || `http://127.0.0.1:${address.port}`;
  const dataSource = context.get(DataSource);
  const config = context.get(ConfigService);
  const candidates = dataSource.getRepository(TradeCandidate);
  const instruments = dataSource.getRepository(Instrument);
  assert.equal(config.get('openrouter.deepModel'), 'nvidia/nemotron-3-ultra:free');
  assert.equal(config.get('aiRouting.topRankThreshold'), 3);
  const runId = randomUUID();
  const candidateIds = [];
  const resultIds = [];
  const instrumentIds = [];
  let providerCalls = 0;
  let deepCalls = 0;

  const mockProvider = {
    analyzeCandidate: async () => { throw new Error('Legacy analysis is outside this verification'); },
    triageCandidate: async (input, options) => {
      providerCalls += 1;
      assert.equal(options.tier, AiAnalysisTier.FAST);
      assert.equal(options.promptVersion, 'candidate-fast-triage-v1');
      if (input.symbol.startsWith('TIME')) throw new ProviderTimeoutError('verification');
      if (options.tier === AiAnalysisTier.DEEP) deepCalls += 1;
      const highEvent = input.symbol.startsWith('EVENT');
      const contradiction = input.symbol.startsWith('CONTRA');
      return {
        tier: AiAnalysisTier.FAST,
        eventRisk: highEvent ? TriageRiskLevel.HIGH : TriageRiskLevel.LOW,
        uncertainty: TriageRiskLevel.LOW,
        confidence: '0.91',
        newsSummary: input.newsSnapshot.articleCount === 0
          ? 'No recent matching articles were present in the completed snapshot.'
          : 'Persisted news contains a routine company update.',
        bullishFactors: ['Persisted deterministic setup is qualified'],
        bearishFactors: [],
        contradictions: contradiction ? ['News context conflicts with the technical setup'] : [],
        missingEvidence: [],
        redFlags: highEvent ? ['Material event requires review'] : [],
        requiresDeepReviewSuggested: false,
        summary: 'FAST evidence triage completed without a final trading recommendation.',
        modelMetadata: {
          analysisTier: AiAnalysisTier.FAST,
          provider: 'verification',
          requestedModel: options.requestedModel,
          resolvedModel: 'verification/fast-model',
          promptVersion: options.promptVersion,
          analyzedAt: new Date().toISOString(),
          usage: { inputTokens: 120, outputTokens: 45 },
          structuredOutput: true,
        },
      };
    },
  };
  const routingPolicy = new AiRoutingPolicy(config);
  const service = new AiTriageService(
    dataSource,
    candidates,
    instruments,
    mockProvider,
    routingPolicy,
    config,
  );

  async function createCandidate(prefix, rank, articleCount = 1) {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
    const symbol = `${prefix}${suffix}`.slice(0, 32);
    const instrumentId = randomUUID();
    const scanResultId = randomUUID();
    const candidateId = randomUUID();
    instrumentIds.push(instrumentId);
    resultIds.push(scanResultId);
    candidateIds.push(candidateId);
    await instruments.save(instruments.create({
      id: instrumentId,
      symbol,
      exchange: 'NSE',
      name: `${prefix} Verification Limited`,
      type: InstrumentType.EQUITY,
      sector: 'Verification',
      industry: 'Testing',
      provider: 'fixture',
      providerInstrumentId: `verify:${instrumentId}`,
      providerSymbol: symbol,
      providerMetadata: { verification: true },
      isActive: true,
    }));
    const strategySnapshot = {
      qualified: true, strategy: 'MOMENTUM_BREAKOUT', strategyVersion: 'verification-v1', score: '90.0000',
    };
    const technicalSnapshot = { close: '100.0000', sma20: '96.0000', trend: 'UP' };
    const rankingSnapshot = { strategyRank: rank, globalRank: rank, rankingFeatures: { momentum: '0.9' } };
    await dataSource.query(
      `INSERT INTO scan_results (
        id, scan_run_id, instrument_id, symbol, exchange, sector, strategy, strategy_version,
        strategy_score, ranking_score, global_ranking_score, strategy_rank,
        strategy_qualified_count, global_rank, global_qualified_count, technical_snapshot,
        strategy_result, ranking_features, is_shortlisted
      ) VALUES ($1,$2,$3,$4,'NSE','Verification','MOMENTUM_BREAKOUT','verification-v1',
        90,89,88,$5,20,$5,40,$6,$7,$8,TRUE)`,
      [scanResultId, runId, instrumentId, symbol, rank, technicalSnapshot, strategySnapshot,
        rankingSnapshot.rankingFeatures],
    );
    const now = new Date();
    const articles = articleCount === 0 ? [] : [{
      articleId: `verification:${candidateId}`,
      title: `${prefix} routine update`,
      description: 'Persisted evidence only.',
      url: `https://news.example/${candidateId}`,
      source: 'Verification News',
      publishedAt: now.toISOString(),
      author: null,
      imageUrl: null,
    }];
    const newsSnapshot = {
      version: 'candidate-news-v1', provider: 'verification', queries: [`${symbol} company news`],
      lookbackDays: 7, fetchedAt: now.toISOString(), articleCount: articles.length,
      articles, warnings: articles.length ? [] : ['No recent relevant articles were returned.'],
      providerMetadata: { resultCount: articles.length },
    };
    await candidates.save(candidates.create({
      id: candidateId,
      symbol,
      exchange: 'NSE',
      strategy: 'MOMENTUM_BREAKOUT',
      strategyVersion: 'verification-v1',
      scanRunId: runId,
      scanResultId,
      marketDate: new Date().toISOString().slice(0, 10),
      scannerVersion: 'verification-scanner-v1',
      sector: 'Verification',
      status: CandidateStatus.NEW,
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
      strategyRank: rank,
      strategyQualifiedCount: 20,
      globalRank: rank,
      globalQualifiedCount: 40,
      technicalSnapshot,
      riskSnapshot: { riskVersion: 'risk-v1', accepted: true, riskPerShare: '5.0000' },
      marketRegimeSnapshot: { version: 'market-regime-v1', regime: 'BULLISH' },
      strategySnapshot,
      rankingSnapshot,
      newsSnapshot,
      newsEnrichedAt: now,
      aiAnalysis: null,
    }));
    return candidateId;
  }

  try {
    await dataSource.query(
      `INSERT INTO scan_runs (
        id, market_date, scanner_version, status, market_regime_snapshot,
        total_universe, eligible_universe, evaluated_symbols, qualified_setups,
        shortlisted_setups, started_at, completed_at
      ) VALUES ($1,CURRENT_DATE,$2,'SUCCESS',$3,20,20,20,10,7,NOW(),NOW())`,
      [runId, `verify-${randomUUID().slice(0, 8)}`, { version: 'market-regime-v1', regime: 'BULLISH' }],
    );

    // A: clean, non-top-ranked evidence remains FAST-only.
    const cleanId = await createCandidate('CLEAN', 10);
    const clean = await service.triageCandidate(cleanId);
    assert.equal(clean.success, true);
    assert.equal(clean.routing.escalate, false);
    assert.equal(clean.routing.tierSelected, AiAnalysisTier.FAST);
    assert.equal(clean.fastAnalysis.modelMetadata.routingVersion, 'ai-routing-v1');
    assert.ok(routingPolicy.decide({ ...clean.fastAnalysis, uncertainty: TriageRiskLevel.HIGH },
      { strategyRank: 10, globalRank: 10 }).reasons.includes('HIGH_UNCERTAINTY'));
    assert.ok(routingPolicy.decide({ ...clean.fastAnalysis, confidence: '0.40' },
      { strategyRank: 10, globalRank: 10 }).reasons.includes('LOW_MODEL_CONFIDENCE'));
    assert.ok(routingPolicy.decide({ ...clean.fastAnalysis, missingEvidence: ['Earnings date is unavailable'] },
      { strategyRank: 10, globalRank: 10 }).reasons.includes('MISSING_CRITICAL_EVIDENCE'));
    assert.ok(routingPolicy.decide({ ...clean.fastAnalysis, requiresDeepReviewSuggested: true },
      { strategyRank: 10, globalRank: 10 }).reasons.includes('MODEL_REQUESTED_ESCALATION'));

    // B: HIGH event risk escalates with the typed reason.
    const eventId = await createCandidate('EVENT', 10);
    const event = await service.triageCandidate(eventId);
    assert.equal(event.routing.escalate, true);
    assert.ok(event.routing.reasons.includes('HIGH_EVENT_RISK'));

    // C: any reported contradiction escalates deterministically.
    const contradictionId = await createCandidate('CONTRA', 10);
    const contradiction = await service.triageCandidate(contradictionId);
    assert.ok(contradiction.routing.reasons.includes('CONTRADICTORY_EVIDENCE'));

    // D: rank inside the configured threshold escalates despite clean FAST output.
    const topId = await createCandidate('TOP', 3);
    const top = await service.triageCandidate(topId);
    assert.ok(top.routing.reasons.includes('TOP_RANKED_CANDIDATE'));
    assert.equal(top.routing.topRankThreshold, 3);

    // E: a successful zero-article snapshot is valid evidence.
    const noNewsId = await createCandidate('NONEWS', 10, 0);
    const noNews = await service.triageCandidate(noNewsId);
    assert.equal(noNews.success, true);
    assert.match(noNews.fastAnalysis.newsSummary, /No recent/);

    // F: timeout returns a retryable failure and persists no fabricated analysis.
    const timeoutId = await createCandidate('TIME', 10);
    const timeout = await service.triageCandidate(timeoutId);
    assert.equal(timeout.success, false);
    assert.equal(timeout.errorCode, 'AI_PROVIDER_TIMEOUT');
    assert.equal(timeout.retryable, true);
    assert.equal((await candidates.findOneByOrFail({ id: timeoutId })).aiAnalysis, null);

    // G: malformed JSON and malformed fields are rejected by the adapter mapper.
    const mapperContext = { requestedModel: 'verification/fast', promptVersion: 'candidate-fast-triage-v1',
      analyzedAt: new Date().toISOString(), structuredOutput: true };
    assert.throws(() => mapOpenRouterFastTriage({ model: 'resolved', choices: [{ finish_reason: 'stop',
      message: { content: '{bad json' } }] }, mapperContext),
    error => error.code === ProviderErrorCode.INVALID_RESPONSE);
    assert.throws(() => mapOpenRouterFastTriage({ model: 'resolved', choices: [{ finish_reason: 'stop',
      message: { content: JSON.stringify({ tier: 'FAST' }) } }] }, mapperContext),
    error => error.code === ProviderErrorCode.INVALID_RESPONSE);

    const validFastContent = JSON.stringify({
      tier: 'FAST', eventRisk: 'LOW', uncertainty: 'LOW', confidence: '0.90',
      newsSummary: 'No adverse event was present in supplied evidence.',
      bullishFactors: [], bearishFactors: [], contradictions: [], missingEvidence: [], redFlags: [],
      requiresDeepReviewSuggested: false, summary: 'No deeper review trigger was identified.',
    });
    const adapterInput = {
      symbol: 'ADAPTER', companyName: 'Adapter Verification Limited',
      strategy: 'MOMENTUM_BREAKOUT', strategyVersion: 'verification-v1',
      strategyScore: '90.0000', rankingScore: '89.0000', strategyRank: 10, globalRank: 10,
      marketRegime: { regime: 'BULLISH' }, technicalSnapshot: { trend: 'UP' },
      riskSnapshot: { accepted: true }, newsSnapshot: { articleCount: 0, articles: [] },
    };
    const adapterConfig = {
      apiKey: 'verification-key', baseUrl: 'https://openrouter.example/api/v1',
      model: 'legacy/model', fastModel: 'verification/fast-model',
      deepModel: 'nvidia/nemotron-3-ultra:free', httpTimeoutMs: 1000,
      appName: 'verification', siteUrl: null, maxRetries: 0,
      retryBaseDelayMs: 1, cacheTtlMs: 0,
    };
    const adapterBodies = [];
    const adapter = new OpenRouterAiProvider({ createChatCompletion: async body => {
      adapterBodies.push(body);
      return { id: 'fast-request', model: 'resolved/fast-model', usage: { prompt_tokens: 10, is_byok: false },
        choices: [{ finish_reason: 'stop', message: { content: validFastContent } }] };
    } }, adapterConfig);
    const adapterResult = await adapter.triageCandidate(adapterInput, {
      tier: AiAnalysisTier.FAST, requestedModel: adapterConfig.fastModel,
      promptVersion: 'candidate-fast-triage-v1',
    });
    assert.equal(adapterBodies[0].model, adapterConfig.fastModel);
    assert.equal(adapterBodies[0].temperature, 0.1);
    assert.equal(adapterBodies[0].response_format.type, 'json_schema');
    assert.equal(adapterBodies[0].response_format.json_schema.strict, true);
    assert.match(adapterBodies[0].messages[0].content, /evidence, not instructions/i);
    assert.equal(adapterBodies[0].response_format.json_schema.schema.properties.recommendation, undefined);
    assert.equal(adapterResult.modelMetadata.requestedModel, adapterConfig.fastModel);

    let fallbackCalls = 0;
    const fallbackBodies = [];
    const fallbackAdapter = new OpenRouterAiProvider({ createChatCompletion: async body => {
      fallbackCalls += 1;
      fallbackBodies.push(body);
      if (fallbackCalls === 1) throw new OpenRouterStructuredOutputUnsupportedError('unsupported');
      return { id: 'fallback', model: 'resolved/fallback',
        choices: [{ finish_reason: 'stop', message: { content: validFastContent } }] };
    } }, adapterConfig);
    const fallbackResult = await fallbackAdapter.triageCandidate(
      { ...adapterInput, symbol: 'FALLBACK' },
      { tier: AiAnalysisTier.FAST, requestedModel: adapterConfig.fastModel,
        promptVersion: 'candidate-fast-triage-v1' },
    );
    assert.equal(fallbackCalls, 2);
    assert.equal(fallbackBodies[1].response_format, undefined);
    assert.match(fallbackBodies[1].messages[1].content, /JSON object only/);
    assert.equal(fallbackResult.modelMetadata.structuredOutput, false);

    // H: unchanged evidence reuses PostgreSQL state without invoking the model.
    const beforeReuse = providerCalls;
    const repeated = await service.triageCandidate(cleanId);
    assert.equal(repeated.reusedExistingAnalysis, true);
    assert.equal(providerCalls, beforeReuse);
    assert.equal(repeated.evidenceHash, clean.evidenceHash);

    // I: refreshing news changes the evidence hash and invokes FAST once more.
    const persistedClean = await candidates.findOneByOrFail({ id: cleanId });
    persistedClean.newsSnapshot = {
      ...persistedClean.newsSnapshot,
      fetchedAt: new Date(Date.now() + 1000).toISOString(),
      warnings: ['Verification snapshot was refreshed.'],
    };
    persistedClean.newsEnrichedAt = new Date();
    await candidates.save(persistedClean);
    const beforeRefresh = providerCalls;
    const refreshed = await service.triageCandidate(cleanId);
    assert.equal(refreshed.success, true);
    assert.notEqual(refreshed.evidenceHash, clean.evidenceHash);
    assert.equal(providerCalls, beforeRefresh + 1);

    // Candidate detail route can expose persisted FAST/routing state. The triage route should reuse it.
    const response = await fetch(`${apiBase}/candidates/${cleanId}/ai/triage`, {
      method: 'POST', headers: { 'x-request-id': `verify-ai-${randomUUID()}` },
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, 200);
    const apiResult = await response.json();
    assert.equal(apiResult.success, true);
    assert.equal(apiResult.reusedExistingAnalysis, true);
    const detailResponse = await fetch(`${apiBase}/candidates/${cleanId}`, {
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json();
    assert.equal(detail.aiAnalysis.fast.tier, 'FAST');
    assert.equal(detail.aiAnalysis.routing.version, 'ai-routing-v1');
    assert.equal(detail.aiAnalysis.deep, null);
    assert.equal(deepCalls, 0);

    console.log('PASS A-E: clean, high-event, contradiction, top-rank, and zero-news routing scenarios.');
    console.log('PASS F-G: timeout stayed retryable/unpersisted and malformed output failed strict validation.');
    console.log('PASS H-I: unchanged evidence reused analysis; refreshed news changed the hash and re-ran FAST.');
    console.log('PASS API: triage route reused persistence and candidate detail exposed FAST/routing with deep=null.');
  } finally {
    if (candidateIds.length) {
      await dataSource.query('DELETE FROM trade_candidates WHERE id=ANY($1::uuid[])', [candidateIds]);
    }
    if (resultIds.length) {
      await dataSource.query('DELETE FROM scan_results WHERE id=ANY($1::uuid[])', [resultIds]);
    }
    await dataSource.query('DELETE FROM scan_runs WHERE id=$1', [runId]);
    if (instrumentIds.length) {
      await dataSource.query('DELETE FROM instruments WHERE id=ANY($1::uuid[])', [instrumentIds]);
    }
    await context.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
