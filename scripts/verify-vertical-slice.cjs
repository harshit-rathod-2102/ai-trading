// Run after npm run build, Flyway migrate, and API startup.
// Leaves clearly named VERIFY-* development records for inspection. Any trades
// created by the verification are cancelled before exit so scheduled monitoring
// does not treat test data as a live position.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initialRisk } = require('../dist/common/utils/price');
const base = process.env.VERIFY_API_URL || 'http://localhost:3000/api';
const suffix = randomUUID().slice(0, 8).toUpperCase();
const sample = {
  symbol: 'RELIANCE',
  exchange: 'NSE',
  strategy: 'MOMENTUM_BREAKOUT',
  strategyVersion: 'v1',
  proposedEntry: '2920.00',
  proposedStop: '2850.00',
  target1: '3070.00',
  target2: '3180.00',
  suggestedQuantity: 20,
  quantScore: 87.4,
  technicalSnapshot: { rsi14: 64.2, volumeRatio: 1.8 },
  riskSnapshot: { riskPerShare: '70.00', plannedRiskAmount: '1400.00' },
};
async function request(path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
}
const create = (kind, extra = {}) =>
  request(
    '/candidates',
    'POST',
    {
      ...sample,
      symbol: 'VERIFY-' + kind + '-' + suffix,
      ...extra,
    },
    201,
  );
const types = (events) => events.map((event) => event.eventType);
async function unchanged(candidate) {
  const current = await request('/candidates/' + candidate.id);
  assert.equal(current.status, 'NEW');
  assert.deepEqual(types(await request('/candidates/' + candidate.id + '/events')), [
    'CANDIDATE_CREATED',
  ]);
  assert.equal((await request('/trades?symbol=' + candidate.symbol)).length, 0);
}

async function main() {
  assert.equal(initialRisk('2918.50', '2850.00', 20), '1370.0000');
  assert.equal(initialRisk('0.3', '0.1', 3), '0.6000');
  assert.equal(
    initialRisk('99999999999999.9999', '0.0001', 2147483647),
    '214748364699999999570503.2706',
  );
  for (const entry of ['0', '-1', '1e3', '0.00001', 'NaN', '100000000000000']) {
    assert.throws(() => initialRisk(entry, '0.1', 1));
  }
  assert.equal((await request('/health')).status, 'ok');

  const skipped = await create('SKIP');
  assert.equal((await request('/candidates/' + skipped.id)).status, 'NEW');
  await request(
    '/candidates/' + skipped.id + '/skip',
    'POST',
    { reason: 'Setup is too extended' },
    201,
  );
  assert.equal((await request('/candidates/' + skipped.id)).status, 'SKIPPED');
  assert.equal((await request('/trades?symbol=' + skipped.symbol)).length, 0);
  const skipEvents = await request('/candidates/' + skipped.id + '/events');
  assert.deepEqual(types(skipEvents), ['CANDIDATE_CREATED', 'CANDIDATE_SKIPPED']);
  assert.equal(skipEvents[1].data.reason, 'Setup is too extended');
  await request(
    '/candidates/' + skipped.id + '/buy',
    'POST',
    { actualEntry: '2918.50', quantity: 20 },
    409,
  );
  await request('/candidates/' + skipped.id + '/skip', 'POST', {}, 409);

  const accepted = await create('BUY');
  const trade = await request(
    '/candidates/' + accepted.id + '/buy',
    'POST',
    { actualEntry: '2918.50', quantity: 20 },
    201,
  );
  const fetched = await request('/trades/' + trade.id);
  assert.equal((await request('/candidates/' + accepted.id)).status, 'ACCEPTED');
  for (const [key, value] of Object.entries({
    candidateId: accepted.id,
    symbol: accepted.symbol,
    strategy: sample.strategy,
    strategyVersion: 'v1',
    status: 'OPEN',
    plannedEntry: '2920.0000',
    actualEntry: '2918.5000',
    quantity: 20,
    initialStop: '2850.0000',
    currentStop: '2850.0000',
    target1: '3070.0000',
    target2: '3180.0000',
    initialRiskAmount: '1370.0000',
    currentPrice: null,
    realizedPnl: '0.0000',
    closedAt: null,
  }))
    assert.equal(fetched[key], value, key);
  assert.ok(Number.isFinite(Date.parse(fetched.entryDecisionAt)));
  assert.deepEqual(types(await request('/trades/' + trade.id + '/events')), [
    'CANDIDATE_CREATED',
    'TRADE_OPENED',
  ]);
  await request(
    '/candidates/' + accepted.id + '/buy',
    'POST',
    { actualEntry: '2918.50', quantity: 20 },
    409,
  );
  await request('/candidates/' + accepted.id + '/skip', 'POST', {}, 409);
  assert.equal((await request('/trades?status=OPEN&symbol=' + accepted.symbol)).length, 1);
  assert.equal((await request('/candidates?status=ACCEPTED&symbol=' + accepted.symbol)).length, 1);
  assert.equal((await request('/trades/' + trade.id + '/events')).length, 2);

  const invalid = await create('INVALID');
  for (const entry of ['2850.00', '2849.99']) {
    await request(
      '/candidates/' + invalid.id + '/buy',
      'POST',
      { actualEntry: entry, quantity: 20 },
      400,
    );
    await unchanged(invalid);
  }
  for (const body of [
    { actualEntry: 2918.5, quantity: 20 },
    { actualEntry: '0', quantity: 20 },
    { actualEntry: '2918.50001', quantity: 20 },
    { actualEntry: '2918.50', quantity: 0 },
    { actualEntry: '2918.50', quantity: 1.5 },
    { actualEntry: '2918.50', quantity: '20' },
    { actualEntry: '2918.50', quantity: 2147483648 },
    { actualEntry: '2918.50', quantity: 20, extra: true },
  ])
    await request('/candidates/' + invalid.id + '/buy', 'POST', body, 400);
  await unchanged(invalid);
  await request('/candidates', 'POST', { ...sample, technicalSnapshot: [] }, 400);
  await request('/candidates', 'POST', { ...sample, quantScore: 101 }, 400);
  await request('/candidates', 'POST', { ...sample, strategy: '   ' }, 400);
  await request('/candidates?status=UNKNOWN', 'GET', undefined, 400);
  await request('/trades?symbol[]=RELIANCE', 'GET', undefined, 400);
  await request('/candidates/not-a-uuid', 'GET', undefined, 400);
  await request('/trades/' + randomUUID(), 'GET', undefined, 404);

  const concurrent = await create('RACE');
  const race = await Promise.all(
    Array.from({ length: 6 }, () =>
      fetch(base + '/candidates/' + concurrent.id + '/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualEntry: '2918.50', quantity: 20 }),
        signal: AbortSignal.timeout(10000),
      }),
    ),
  );
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409, 409, 409, 409, 409]);
  assert.equal((await request('/trades?symbol=' + concurrent.symbol)).length, 1);
  assert.deepEqual(types(await request('/candidates/' + concurrent.id + '/events')), [
    'CANDIDATE_CREATED',
    'TRADE_OPENED',
  ]);

  const mixed = await create('MIXED');
  const mixedResults = await Promise.all(
    ['buy', 'skip'].map((action) =>
      fetch(base + '/candidates/' + mixed.id + '/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'buy' ? { actualEntry: '2918.50', quantity: 20 } : {}),
        signal: AbortSignal.timeout(10000),
      }),
    ),
  );
  assert.deepEqual(mixedResults.map((r) => r.status).sort(), [201, 409]);
  const mixedCandidate = await request('/candidates/' + mixed.id);
  assert.equal(
    (await request('/trades?symbol=' + mixed.symbol)).length,
    mixedCandidate.status === 'ACCEPTED' ? 1 : 0,
  );
  assert.equal((await request('/candidates/' + mixed.id + '/events')).length, 2);

  // Separate application context: fail journal insertion after trade/status writes.
  // This exercises the real services and PostgreSQL rollback without changing the running API.
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { CandidatesService } = require('../dist/candidates/candidates.service');
  const { JournalService } = require('../dist/journal/journal.service');
  const { DataSource } = require('typeorm');
  const { Trade } = require('../dist/trades/entities/trade.entity');
  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const dataSource = context.get(DataSource);
  try {
    const service = context.get(CandidatesService);
    const journal = context.get(JournalService);
    const rollback = await create('ROLLBACK');
    const originalRecord = journal.record;
    journal.record = async () => {
      throw new Error('Injected journal failure');
    };
    try {
      await assert.rejects(
        service.buy(rollback.id, { actualEntry: '2918.50', quantity: 20 }),
        /Injected journal failure/,
      );
      await unchanged(rollback);
      await assert.rejects(
        service.skip(rollback.id, 'Rollback verification'),
        /Injected journal failure/,
      );
      await unchanged(rollback);
      const symbol = 'VERIFY-CREATEFAIL-' + suffix;
      await assert.rejects(service.create({ ...sample, symbol }), /Injected journal failure/);
      assert.equal((await request('/candidates?symbol=' + symbol)).length, 0);
    } finally {
      journal.record = originalRecord;
    }

    // Verify DB uniqueness independently of service state checks.
    const repository = dataSource.getRepository(Trade);
    const duplicate = await repository.findOneByOrFail({ id: trade.id });
    await assert.rejects(
      repository.insert({ ...duplicate, id: randomUUID() }),
      (error) => error.driverError?.code === '23505',
    );
  } finally {
    await dataSource.query(
      `UPDATE trades
       SET status = 'CANCELLED', closed_at = COALESCE(closed_at, NOW()), updated_at = NOW()
       WHERE status = 'OPEN' AND symbol LIKE $1`,
      [`VERIFY-%-${suffix}`],
    );
    await context.close();
  }

  console.log(
    JSON.stringify(
      {
        result: 'PASS',
        skipCandidateId: skipped.id,
        buyCandidateId: accepted.id,
        tradeId: trade.id,
        initialRiskAmount: fetched.initialRiskAmount,
        verified: [
          'SKIP',
          'BUY',
          'filters',
          'decimal precision',
          'DTO validation',
          'duplicate BUY',
          'concurrent BUY',
          'BUY/SKIP race',
          'invalid BUY unchanged',
          'journal rollback',
          'database uniqueness',
        ],
        note: 'VERIFY-* records retained for inspection; verification trades are cancelled',
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
