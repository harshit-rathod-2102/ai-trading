// Exercises the running API/worker and actual PostgreSQL persistence.
// Uses finite synthetic fixtures; keeps seeded instruments and candles for inspection.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { seed, request } = require('./seed-market-data.cjs');
async function body(path, method, data, expected) { return (await request(path, method, data, expected)).body; }
async function completed(jobId, expectedState = 'completed') {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const job = await body('/market-data/jobs/' + jobId);
    if (['completed', 'failed'].includes(job.state)) {
      assert.equal(job.state, expectedState, JSON.stringify(job));
      return job;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Timed out waiting for job ' + jobId);
}
async function main() {
  assert.equal((await body('/health')).status, 'ok');
  const setup = await seed();
  const seededAgain = await seed();
  assert.deepEqual(setup.instruments.map(item => item.id), seededAgain.instruments.map(item => item.id));
  assert.equal((await body('/universes/' + setup.universe + '/instruments')).length, 3);
  assert.equal((await body('/market-data/universe')).code, setup.universe);
  const range = setup.range;
  const query = '?from=' + range.from + '&to=' + range.to;
  const equity = setup.instruments.find(item => item.symbol === 'RELIANCE');
  const index = setup.instruments.find(item => item.type === 'INDEX');
  const path = id => '/market-data/instruments/' + id;
  const list = id => body(path(id) + '/candles' + query);

  const refreshUniverse = await body('/market-data/refresh-universe', 'POST', range, 202);
  assert.equal(refreshUniverse.jobs.length, 3);
  await Promise.all(refreshUniverse.jobs.map(job => completed(job.jobId)));
  const first = await list(equity.id);
  assert.equal(first.length, 5);
  assert.deepEqual(first.map(row => row.sessionDate),
    ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']);
  assert.equal(first[0].open, '2900.0000');
  assert.equal(first[0].volume, '1000000');
  assert.ok(first.every(row => row.isSynthetic && row.provider === 'fixture-v1'));
  assert.ok((await list(index.id)).every(row => row.volume === null));
  const jobs = await Promise.all(Array.from({ length: 4 }, () =>
    body(path(equity.id) + '/refresh', 'POST', range, 202)));
  await Promise.all(jobs.map(job => completed(job.jobId)));
  const repeated = await list(equity.id);
  assert.deepEqual(repeated.map(row => row.id), first.map(row => row.id));
  assert.deepEqual(repeated.map(row => row.createdAt), first.map(row => row.createdAt));
  assert.equal(repeated.length, 5);
  const quality = await body(path(equity.id) + '/quality' + query);
  assert.equal(quality.completeness, 'COMPLETE');
  assert.equal(quality.validity, 'VALID');
  assert.equal(quality.expectedCount, 5);
  assert.equal(quality.isSynthetic, true);
  assert.equal(quality.readyForStrategy, false);
  assert.equal(quality.missingSessions.length, 0);
  assert.equal((await body('/instruments?type=INDEX&universe=' + setup.universe)).length, 1);
  assert.equal((await body(path(equity.id) + '/candles?from=2026-09-08&to=2026-09-09')).length, 2);
  await body(path(equity.id) + '/candles?from=2026-02-30&to=2026-09-11', 'GET', undefined, 400);
  await body(path(equity.id) + '/refresh', 'POST', { from: '2026-09-11', to: '2026-09-07' }, 400);
  await body(path(equity.id) + '/refresh', 'POST', { from: '2099-01-01', to: '2099-01-02' }, 400);
  await body(path(equity.id) + '/refresh', 'POST', { ...range, extra: true }, 400);
  await body('/instruments', 'POST', { ...setup.instruments[0], name: 'Bad extra fields' }, 400);
  await body('/instruments?active=not-boolean', 'GET', undefined, 400);
  await body('/universes/BAD!/instruments/' + equity.id, 'PUT', {}, 400);

  await body('/instruments/' + equity.id + '/activity', 'PATCH', { isActive: false }, 200);
  try {
    await body(path(equity.id) + '/refresh', 'POST', range, 409);
    assert.ok(!(await body('/market-data/universe')).instruments.some(item => item.id === equity.id));
    assert.equal((await list(equity.id)).length, 5);
  } finally {
    await body('/instruments/' + equity.id + '/activity', 'PATCH', { isActive: true }, 200);
  }
  const unsupported = await body('/instruments', 'POST', {
    symbol: 'VERIFY-' + randomUUID().slice(0, 8).toUpperCase(), exchange: 'NSE',
    name: 'Unsupported fixture verification', type: 'EQUITY',
  }, 201);
  const missing = await body(path(unsupported.id) + '/quality' + query);
  assert.equal(missing.validity, 'NO_DATA');
  assert.equal(missing.completeness, 'MISSING');
  assert.equal(missing.missingSessions.length, 5);
  const failedJob = await body(path(unsupported.id) + '/refresh', 'POST', range, 202);
  await completed(failedJob.jobId, 'failed');
  assert.equal((await list(unsupported.id)).length, 0);

  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { MarketDataService } = require('../dist/market-data/market-data.service');
  const { DataQualityService } = require('../dist/market-data/data-quality.service');
  const { MARKET_DATA_PROVIDER } = require('../dist/providers/market-data/market-data-provider.token');
  const { DailyCandle } = require('../dist/market-data/entities/daily-candle.entity');
  const { DataSource } = require('typeorm');
  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const service = context.get(MarketDataService);
    const provider = context.get(MARKET_DATA_PROVIDER);
    const qualityService = context.get(DataQualityService);
    const repository = context.get(DataSource).getRepository(DailyCandle);
    const originalFetch = provider.getHistoricalCandles.bind(provider);
    const originalCalendar = provider.getTradingCalendar.bind(provider);
    const providerRequest = {
      instrument: { symbol: equity.symbol, exchange: equity.exchange, instrumentType: equity.type },
      interval: 'ONE_DAY', ...range,
    };
    const raw = await originalFetch(providerRequest, { signal: new AbortController().signal });
    const snapshot = await list(equity.id);
    const malformedBatches = [
      raw.slice(1), [...raw, raw[0]],
      raw.map((row, i) => i === 0 ? { ...row, high: '1' } : row),
      raw.map((row, i) => i === 0 ? { ...row, open: '0' } : row),
      raw.map((row, i) => i === 0 ? { ...row, volume: '-1' } : row),
      raw.map((row, i) => i === 0 ? { ...row, volume: '1.5' } : row),
      raw.map((row, i) => i === 0 ? { ...row, volume: null } : row),
      raw.map((row, i) => i === 0 ? { ...row, open: 2900 } : row),
      raw.map((row, i) => i === 0 ? { ...row, close: '2900.00001' } : row),
      [...raw, { ...raw[0], sessionDate: '2026-09-12' }],
      [...raw, { ...raw[0], sessionDate: '2026-09-06' }],
      raw.map((row, i) => i === 0 ? { ...row, sessionDate: '2026-02-30' } : row),
      null, [null],
    ];
    try {
      for (const batch of malformedBatches) {
        provider.getHistoricalCandles = async () => batch;
        await assert.rejects(service.refresh(equity.id, range.from, range.to));
        assert.deepEqual(await list(equity.id), snapshot, 'Invalid batch changed persisted rows');
      }
      provider.getHistoricalCandles = originalFetch;
      const calendar = await originalCalendar({ exchange: 'NSE' }, { signal: new AbortController().signal });
      provider.getTradingCalendar = async () => ({ ...calendar, sessions: [...calendar.sessions, calendar.sessions[0]] });
      await assert.rejects(service.refresh(equity.id, range.from, range.to));
      assert.deepEqual(await list(equity.id), snapshot);
      provider.getTradingCalendar = originalCalendar;

      // A correction is an upsert, not a second candle. Preserve exact large values.
      provider.getHistoricalCandles = async () => raw.map((row, i) => i === 0 ? {
        ...row, open: '99999999999999.9999', high: '99999999999999.9999',
        low: '99999999999999.9999', close: '99999999999999.9999',
        volume: '99999999999999999999',
      } : row);
      await service.refresh(equity.id, range.from, range.to);
      const precise = await list(equity.id);
      assert.equal(precise[0].id, snapshot[0].id);
      assert.equal(precise[0].close, '99999999999999.9999');
      assert.equal(precise[0].volume, '99999999999999999999');
      provider.getHistoricalCandles = async () => raw.map((row, i) => i === 0 ? { ...row, volume: '0' } : row);
      await service.refresh(equity.id, range.from, range.to);
      assert.deepEqual((await service.quality(equity.id, range.from, range.to)).zeroVolumeSessions, ['2026-09-07']);
    } finally {
      provider.getHistoricalCandles = originalFetch;
      provider.getTradingCalendar = originalCalendar;
      await service.refresh(equity.id, range.from, range.to);
    }
    const rows = await repository.find({ where: { instrumentId: equity.id }, order: { sessionDate: 'ASC' } });
    const calendar = await originalCalendar({ exchange: 'NSE' }, { signal: new AbortController().signal });
    const assess = (data, latest, now) => qualityService.assess(equity, data, latest, calendar, range.from, range.to, new Date(now));
    assert.equal(assess(rows, rows.at(-1), '2026-09-13T12:00:00Z').freshness, 'CURRENT');
    assert.equal(assess(rows, rows.at(-1), '2026-09-14T12:00:00Z').freshness, 'UNKNOWN');
    const gap = assess(rows.slice(0, -1), rows.at(-2), '2026-09-13T12:00:00Z');
    assert.equal(gap.freshness, 'STALE');
    assert.deepEqual(gap.missingSessions, ['2026-09-11']);
    const intraday = qualityService.assess(equity, rows.slice(0, -1), rows.at(-2), calendar,
      '2026-09-07', '2026-09-11', new Date('2026-09-11T09:00:00Z'));
    assert.equal(intraday.freshness, 'CURRENT');
    assert.equal(intraday.completeness, 'COMPLETE');
    const badStored = [{ ...rows[0], low: '99999' }, ...rows.slice(1)];
    assert.equal(assess(badStored, rows.at(-1), '2026-09-13T12:00:00Z').validity, 'INVALID');
    assert.equal(qualityService.assess(equity, rows, rows.at(-1), calendar,
      '2026-09-01', range.to, new Date('2026-09-13T12:00:00Z')).completeness, 'UNKNOWN');

    await assert.rejects(repository.insert({ ...rows[0], id: randomUUID() }),
      error => error.driverError?.code === '23505');
    await assert.rejects(repository.update(rows[0].id, { low: '99999' }),
      error => error.driverError?.code === '23514');
    assert.equal((await list(equity.id))[0].low, '2880.0000');

    const originalBasis = provider.adjustmentBasis;
    const originalSynthetic = provider.isSynthetic;
    try {
      provider.adjustmentBasis = 'SPLIT_ADJUSTED';
      await assert.rejects(service.refresh(equity.id, range.from, range.to), /Cannot mix/);
      provider.adjustmentBasis = originalBasis;
      provider.isSynthetic = false;
      await assert.rejects(service.refresh(equity.id, range.from, range.to), /Cannot mix/);
    } finally {
      provider.adjustmentBasis = originalBasis;
      provider.isSynthetic = originalSynthetic;
    }
  } finally { await context.close(); }
  console.log(JSON.stringify({
    result: 'PASS', universe: setup.universe, equityId: equity.id, indexId: index.id,
    candlesPerInstrument: 5, synthetic: true,
    verified: ['instrument and universe idempotence', 'queued universe refresh', 'equity/index candles',
      'concurrent repeat refresh', 'stable candle IDs', 'range and DTO validation',
      'inactive instrument handling', 'failed provider job', 'invalid batch atomicity',
      'OHLCV precision', 'missing/stale/unknown data', 'session-close handling',
      'database uniqueness and OHLC constraints', 'provenance separation'],
  }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
