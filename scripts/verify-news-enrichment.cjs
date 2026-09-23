// End-to-end NewsEnrichmentService verification with a provider fake and real PostgreSQL persistence.
// This intentionally avoids spending external GNews quota.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');

if (existsSync('.env')) process.loadEnvFile('.env');

const apiBase = process.env.VERIFY_API_URL || 'http://localhost:3000/api';

function article({ id, title, description = null, url, source = 'Verification News', publishedAt }) {
  return {
    reference: `fake:${id}`,
    title,
    description,
    url,
    sourceName: source,
    publishedAt,
    author: 'Verification Author',
    imageUrl: null,
    metadata: { provider: 'fake', providerArticleId: id },
  };
}

async function api(path, method = 'GET') {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: { 'x-request-id': `verify-news-${randomUUID()}` },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { NewsEnrichmentService } = require('../dist/news/news-enrichment.service');
  const { TradeCandidate } = require('../dist/candidates/entities/trade-candidate.entity');
  const { Instrument } = require('../dist/instruments/entities/instrument.entity');
  const { CandidateStatus } = require('../dist/common/enums/candidate-status.enum');
  const { GNewsClient } = require('../dist/providers/news/gnews/gnews-client');
  const {
    ProviderRateLimitError,
    ProviderTimeoutError,
  } = require('../dist/providers/provider-error');
  const { DataSource } = require('typeorm');

  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const dataSource = context.get(DataSource);
  const service = context.get(NewsEnrichmentService);
  const candidates = dataSource.getRepository(TradeCandidate);
  const instruments = dataSource.getRepository(Instrument);
  const candidateIds = [];

  async function createCandidate(status = CandidateStatus.NEW) {
    const instrument = await instruments.createQueryBuilder('instrument')
      .where("instrument.type = 'EQUITY'")
      .andWhere('instrument.isActive = TRUE')
      .andWhere("instrument.name <> ''")
      .orderBy('instrument.symbol', 'ASC')
      .getOne();
    assert.ok(instrument, 'Verification requires one named active equity instrument');
    const id = randomUUID();
    candidateIds.push(id);
    await candidates.save(candidates.create({
      id,
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      strategy: 'MOMENTUM_BREAKOUT',
      strategyVersion: 'verification-v1',
      status,
      detectedAt: new Date(),
      proposedEntry: '820.0000',
      proposedStop: '795.0000',
      target1: '870.0000',
      target2: '895.0000',
      suggestedQuantity: 10,
      quantScore: '90.0000',
      technicalSnapshot: { verification: true },
      riskSnapshot: { riskVersion: 'verification-v1' },
      aiAnalysis: null,
    }));
    return { id, instrument };
  }

  try {
    const now = new Date();
    const isoAgo = hours => new Date(now.getTime() - hours * 3_600_000).toISOString();

    // A, D, E: normal enrichment, three duplicate identities, stale filtering, relevance, sorting, persistence.
    const normal = await createCandidate();
    const company = normal.instrument.name;
    let providerCalls = 0;
    let capturedQuery;
    service.provider = {
      search: async query => {
        providerCalls += 1;
        capturedQuery = query;
        const newest = article({ id: 'primary', title: `${company} wins a major order`,
          url: 'https://news.example/company-order?utm_source=verification', publishedAt: isoAgo(1) });
        return [
          newest,
          { ...newest, reference: 'fake:duplicate-provider', url: 'https://news.example/duplicate-provider' },
          article({ id: 'duplicate-url', title: `${company} duplicate URL`,
            url: 'https://news.example/company-order?utm_medium=test', publishedAt: isoAgo(2) }),
          article({ id: 'duplicate-fallback', title: newest.title,
            url: 'https://syndicated.example/same-story', publishedAt: newest.publishedAt }),
          article({ id: 'older', title: `${normal.instrument.symbol} reports quarterly results`,
            url: 'https://news.example/results', publishedAt: isoAgo(3) }),
          article({ id: 'stale', title: `${company} old event`,
            url: 'https://news.example/stale', publishedAt: isoAgo(24 * 8) }),
          article({ id: 'irrelevant', title: 'Unrelated global sports report',
            url: 'https://news.example/unrelated', publishedAt: isoAgo(4) }),
        ];
      },
    };
    const enriched = await service.enrichCandidate(normal.id);
    assert.equal(enriched.success, true);
    assert.equal(enriched.reusedExistingSnapshot, false);
    assert.equal(enriched.articleCount, 2);
    assert.equal(enriched.snapshot.version, 'candidate-news-v1');
    assert.equal(enriched.snapshot.lookbackDays, 7);
    assert.equal(enriched.snapshot.articles[0].articleId, 'fake:primary');
    assert.equal(enriched.snapshot.articles[1].articleId, 'fake:older');
    assert.equal(enriched.snapshot.providerMetadata.duplicateCount, 3);
    assert.equal(enriched.snapshot.providerMetadata.staleCount, 1);
    assert.equal(enriched.snapshot.providerMetadata.relevanceFilteredCount, 1);
    assert.equal(providerCalls, 1);
    assert.equal(capturedQuery.query, `"${company}"`);
    assert.equal(capturedQuery.limit, 10);
    assert.equal(capturedQuery.language, 'en');
    assert.equal(capturedQuery.country, 'in');
    const persisted = await candidates.findOneByOrFail({ id: normal.id });
    assert.equal(persisted.status, CandidateStatus.NEW);
    assert.equal(persisted.newsSnapshot.version, 'candidate-news-v1');
    assert.ok(persisted.newsEnrichedAt instanceof Date);
    assert.equal(persisted.aiAnalysis, null);

    // B and API: a fresh snapshot is reused without calling the provider again and appears in detail.
    const repeated = await service.enrichCandidate(normal.id);
    assert.equal(repeated.reusedExistingSnapshot, true);
    assert.equal(providerCalls, 1);
    const endpoint = await api(`/candidates/${normal.id}/news/enrich`, 'POST');
    assert.equal(endpoint.status, 200, JSON.stringify(endpoint.body));
    assert.equal(endpoint.body.success, true);
    assert.equal(endpoint.body.reusedExistingSnapshot, true);
    const detail = await api(`/candidates/${normal.id}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.newsSnapshot.version, 'candidate-news-v1');
    assert.ok(detail.body.newsEnrichedAt);

    // C: a successful empty provider response persists a valid zero-article snapshot.
    const noArticles = await createCandidate();
    service.provider = { search: async () => [] };
    const empty = await service.enrichCandidate(noArticles.id);
    assert.equal(empty.success, true);
    assert.equal(empty.articleCount, 0);
    assert.ok(empty.warnings.some(value => value.includes('No relevant recent news')));
    assert.equal((await candidates.findOneByOrFail({ id: noArticles.id })).newsSnapshot.articleCount, 0);

    const capped = await createCandidate();
    service.provider = { search: async () => Array.from({ length: 12 }, (_, index) => article({
      id: `cap-${index}`,
      title: `${capped.instrument.name} event ${index}`,
      url: `https://news.example/cap-${index}`,
      publishedAt: isoAgo(index + 1),
    })) };
    const cappedResult = await service.enrichCandidate(capped.id);
    assert.equal(cappedResult.articleCount, 10);
    assert.ok(cappedResult.warnings.some(value => value.includes('Only the newest 10')));
    assert.equal(cappedResult.snapshot.articles[0].articleId, 'fake:cap-0');

    // F: timeout returns a retryable typed failure and does not fabricate a snapshot.
    const timeout = await createCandidate();
    service.provider = { search: async () => { throw new ProviderTimeoutError('fake'); } };
    const timedOut = await service.enrichCandidate(timeout.id);
    assert.equal(timedOut.success, false);
    assert.equal(timedOut.errorCode, 'NEWS_PROVIDER_TIMEOUT');
    assert.equal(timedOut.retryable, true);
    assert.equal((await candidates.findOneByOrFail({ id: timeout.id })).newsSnapshot, null);

    // G: distinguish ordinary rate limiting from exhausted provider quota.
    const rateLimited = await createCandidate();
    service.provider = { search: async () => { throw new ProviderRateLimitError('fake', 'Rate limit exceeded'); } };
    const rate = await service.enrichCandidate(rateLimited.id);
    assert.equal(rate.errorCode, 'NEWS_PROVIDER_RATE_LIMIT');
    assert.equal((await candidates.findOneByOrFail({ id: rateLimited.id })).newsSnapshot, null);
    const quotaLimited = await createCandidate();
    service.provider = { search: async () => { throw new ProviderRateLimitError('fake', 'Daily quota exhausted'); } };
    const quota = await service.enrichCandidate(quotaLimited.id);
    assert.equal(quota.errorCode, 'NEWS_PROVIDER_QUOTA');
    assert.equal((await candidates.findOneByOrFail({ id: quotaLimited.id })).newsSnapshot, null);

    // H: a terminal candidate is rejected before provider invocation.
    const terminal = await createCandidate(CandidateStatus.SKIPPED);
    let terminalProviderCalls = 0;
    service.provider = { search: async () => { terminalProviderCalls += 1; return []; } };
    await assert.rejects(service.enrichCandidate(terminal.id), error =>
      error?.response?.code === 'CANDIDATE_NOT_ELIGIBLE');
    assert.equal(terminalProviderCalls, 0);

    // I: simultaneous calls join one in-flight provider operation and persist once.
    const concurrent = await createCandidate();
    let concurrentCalls = 0;
    service.provider = { search: async () => {
      concurrentCalls += 1;
      await new Promise(resolve => setTimeout(resolve, 75));
      return [article({ id: 'concurrent', title: `${concurrent.instrument.name} update`,
        url: 'https://news.example/concurrent', publishedAt: isoAgo(1) })];
    } };
    const pair = await Promise.all([
      service.enrichCandidate(concurrent.id),
      service.enrichCandidate(concurrent.id),
    ]);
    assert.equal(concurrentCalls, 1);
    assert.equal(pair[0].success, true);
    assert.equal(pair[1].success, true);
    assert.deepEqual(pair[0].snapshot, pair[1].snapshot);
    assert.equal((await candidates.findOneByOrFail({ id: concurrent.id })).newsSnapshot.articleCount, 1);

    // The concrete adapter maps its own abort timer to the provider-neutral timeout type.
    const originalFetch = global.fetch;
    try {
      global.fetch = async (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('simulated abort')), { once: true });
      });
      const client = new GNewsClient({
        apiKey: 'verification-key', baseUrl: 'https://gnews.example/api/v4',
        defaultLanguage: 'en', defaultCountry: 'in', maxResults: 10,
        httpTimeoutMs: 5, maxRetries: 0, retryBaseDelayMs: 1, cacheTtlMs: 0,
      });
      await assert.rejects(client.search(new URLSearchParams('q=verification')),
        error => error instanceof ProviderTimeoutError);
    } finally {
      global.fetch = originalFetch;
    }

    console.log('PASS A-E: query context, normal persistence, reuse, zero articles, deduplication, relevance, staleness, and sorting.');
    console.log('PASS F-G: timeout, rate-limit, and quota failures remained typed, retryable where appropriate, and unpersisted.');
    console.log('PASS H-I: terminal candidates were rejected and concurrent calls shared one provider operation.');
    console.log('PASS API: enrichment endpoint reused persisted evidence and candidate detail exposed the snapshot.');
  } finally {
    if (candidateIds.length) {
      await dataSource.query('DELETE FROM trade_candidates WHERE id=ANY($1::uuid[])', [candidateIds]);
    }
    await context.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
