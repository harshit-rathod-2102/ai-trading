const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const path = 'postman/AI-Trading-Backend.postman_collection.json';
const collection = JSON.parse(readFileSync(path, 'utf8'));
const requests = [];
function walk(items) {
  for (const item of items || []) {
    if (item.request) requests.push(item.request);
    if (item.item) walk(item.item);
  }
}
walk(collection.item);

const actual = new Set(requests.map(request => {
  const raw = typeof request.url === 'string' ? request.url : request.url.raw;
  assert.ok(raw.startsWith('{{baseUrl}}/'), `Request URL must use baseUrl: ${raw}`);
  if (request.body?.mode === 'raw' && request.body.options?.raw?.language === 'json') JSON.parse(request.body.raw);
  return `${request.method} ${raw.slice('{{baseUrl}}'.length).split('?')[0]}`;
}));
const expected = new Set([
  'GET /health',
  'GET /upstox/auth/status', 'POST /upstox/auth/request-token',
  'POST /webhooks/upstox/access-token',
  'GET /settings/trading-profile', 'PUT /settings/trading-profile',
  'GET /instruments', 'POST /instruments', 'GET /instruments/{{instrumentId}}',
  'PATCH /instruments/{{createdInstrumentId}}/activity',
  'GET /universes', 'POST /universes', 'GET /universes/{{universeCode}}/instruments',
  'PUT /universes/{{createdUniverseCode}}/instruments/{{createdInstrumentId}}',
  'GET /market-data/provider', 'POST /market-data/instruments/sync', 'GET /market-data/universe',
  'GET /market-data/instruments/{{instrumentId}}/candles',
  'GET /market-data/instruments/{{instrumentId}}/quality',
  'POST /market-data/instruments/{{instrumentId}}/refresh', 'POST /market-data/refresh-universe',
  'GET /market-data/jobs/{{marketDataJobId}}',
  'GET /market-regime',
  'POST /scanner/run', 'GET /scanner/runs', 'GET /scanner/runs/{{scanRunId}}',
  'GET /scanner/runs/{{scanRunId}}/results',
  'POST /risk/evaluate/{{scanResultId}}',
  'POST /candidates/from-scan-result/{{scanResultId}}',
  'POST /candidates', 'GET /candidates', 'GET /candidates/{{candidateId}}',
  'POST /candidates/{{candidateId}}/news/enrich',
  'POST /candidates/{{candidateId}}/ai/triage',
  'POST /candidates/{{candidateId}}/ai/deep-review',
  'POST /candidates/{{candidateId}}/finalize',
  'POST /candidates/{{candidateId}}/notify',
  'GET /candidates/{{candidateId}}/events', 'POST /candidates/{{candidateId}}/buy',
  'POST /candidates/{{skipCandidateId}}/skip',
  'GET /trades', 'GET /trades/{{tradeId}}', 'GET /trades/{{tradeId}}/events',
  'POST /trade-monitor/run', 'POST /trade-monitor/trades/{{tradeId}}',
  'POST /jobs/trade-monitor/run', 'POST /jobs/post-market/run',
  'POST /jobs/run-now', 'POST /jobs/evening/run',
  'GET /daily-summary/{{summaryMarketDate}}', 'POST /daily-summary/{{summaryMarketDate}}/send',
  'GET /analytics/overview', 'GET /analytics/strategies', 'GET /analytics/regimes',
  'GET /analytics/sectors', 'GET /analytics/score-buckets',
  'GET /analytics/accepted-vs-skipped', 'GET /analytics/funnel',
  'GET /news/search', 'POST /ai-analysis/candidate', 'POST /messaging/test',
  'GET /ai-evaluation/fixtures', 'POST /ai-evaluation/fixtures/clean-strong/run',
  'POST /ai-evaluation/run',
  'GET /webhooks/whatsapp', 'POST /webhooks/whatsapp',
]);
assert.deepEqual([...actual].sort(), [...expected].sort());
assert.equal(actual.size, 66);
assert.equal(requests.length, 69);
assert.equal(collection.info.schema, 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
const variables = new Map(collection.variable.map(variable => [variable.key, variable.value]));
assert.equal(variables.get('baseUrl'), 'http://localhost:3000/api');
assert.equal(variables.get('upstoxClientId'), '');
assert.equal(variables.get('metaWhatsappAppSecret'), '');
assert.equal(variables.get('whatsappVerifyToken'), '');
assert.equal(variables.get('summaryMarketDate'), '2026-09-19');
assert.equal(variables.get('analyticsFrom'), '2026-01-01');
assert.equal(variables.get('analyticsTo'), '2026-09-20');
console.log('PASS: valid Postman Collection v2.1 JSON with 69 requests covering all 66 unique API routes.');
