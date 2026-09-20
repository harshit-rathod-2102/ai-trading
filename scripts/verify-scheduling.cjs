const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

process.env.CANDIDATE_ANALYSIS_CONCURRENCY = '2';

async function main() {
  const { marketClock, isWithinTimeRange } = require('../dist/common/utils/market-time');
  const { TradeMonitorProcessor } = require('../dist/jobs/processors/trade-monitor.processor');
  const { TradingDayScheduler } = require('../dist/jobs/schedulers/trading-day.scheduler');
  const { CandidateAnalysisService } = require('../dist/jobs/services/candidate-analysis.service');
  const { DailyPipelineService } = require('../dist/jobs/services/daily-pipeline.service');
  const { CandidateStageError } = require('../dist/jobs/models/candidate-stage.error');
  const { CandidateStatus } = require('../dist/common/enums/candidate-status.enum');

  const values = {
    'scheduler.enabled': true,
    'scheduler.timezone': 'Asia/Kolkata',
    'scheduler.marketOpenTime': '09:15',
    'scheduler.marketCloseTime': '15:30',
    'scheduler.postMarketRunTime': '15:45',
    'scheduler.eveningRunTime': '19:00',
    'scheduler.catchUpCutoffTime': '21:00',
    'scheduler.tradeMonitorIntervalMinutes': 15,
  };
  const config = { getOrThrow: key => {
    assert.ok(key in values, `Missing fake config ${key}`);
    return values[key];
  } };

  const monday = new Date('2026-09-21T04:30:00.000Z'); // 10:00 IST
  assert.deepEqual(marketClock(monday), {
    marketDate: '2026-09-21', hour: 10, minute: 0, weekday: 1, hhmm: '10:00',
  });
  assert.equal(isWithinTimeRange('09:15', '09:15', '15:30'), true);
  assert.equal(isWithinTimeRange('15:31', '09:15', '15:30'), false);

  let monitorCalls = 0;
  const tradingDays = {
    isWeekend: date => [0, 6].includes(new Date(`${date}T00:00:00.000Z`).getUTCDay()),
    isTradingDay: async () => true,
  };
  const monitorProcessor = new TradeMonitorProcessor(config, tradingDays, {
    monitorOpenTrades: async () => { monitorCalls += 1; return { monitored: 1 }; },
  });
  const fakeJob = data => ({ id: 'job-1', name: 'TRADE_MONITOR_RUN', data,
    attemptsMade: 0, opts: { attempts: 2 } });
  const realDate = global.Date;
  try {
    global.Date = class extends realDate { constructor(...args) { super(...(args.length ? args : [monday])); } };
    assert.deepEqual(await monitorProcessor.process(fakeJob({ triggerSource: 'MANUAL' })), { monitored: 1 });
    assert.equal(monitorCalls, 1);
    const beforeOpen = new realDate('2026-09-21T02:00:00.000Z'); // 07:30 IST
    global.Date = class extends realDate { constructor(...args) { super(...(args.length ? args : [beforeOpen])); } };
    assert.equal((await monitorProcessor.process(fakeJob({ triggerSource: 'MANUAL' }))).status,
      'SKIPPED_OUTSIDE_MARKET_HOURS');
    const saturday = new realDate('2026-09-19T04:30:00.000Z');
    global.Date = class extends realDate { constructor(...args) { super(...(args.length ? args : [saturday])); } };
    assert.equal((await monitorProcessor.process(fakeJob({ triggerSource: 'MANUAL' }))).status,
      'SKIPPED_OUTSIDE_MARKET_HOURS');
    assert.equal(monitorCalls, 1);
  } finally { global.Date = realDate; }

  const makeQueue = () => ({
    schedulers: new Map(), removed: [],
    async upsertJobScheduler(id, repeat, template) { this.schedulers.set(id, { repeat, template }); },
    async removeJobScheduler(id) { this.removed.push(id); this.schedulers.delete(id); return true; },
  });
  const monitoringQueue = makeQueue();
  const postQueue = makeQueue();
  const eveningQueue = makeQueue();
  const catchUps = new Map();
  const scheduler = new TradingDayScheduler(config, {
    enqueuePostMarket: async (source, date) => {
      catchUps.set(`post-market-${date}`, { source, date });
      return { jobId: `post-market-${date}` };
    },
  }, { hasSuccessfulRun: async () => false }, { isTradingDay: async () => true },
  monitoringQueue, postQueue, eveningQueue);
  await scheduler.onApplicationBootstrap(new Date('2026-09-21T11:30:00.000Z')); // 17:00 IST
  await scheduler.onApplicationBootstrap(new Date('2026-09-21T11:30:00.000Z'));
  assert.equal(monitoringQueue.schedulers.size, 1);
  assert.equal(postQueue.schedulers.size, 1);
  assert.equal(eveningQueue.schedulers.size, 1);
  assert.equal(catchUps.size, 1, 'deterministic queue identity deduplicates catch-up');
  assert.equal(catchUps.get('post-market-2026-09-21').date, '2026-09-21');
  values['scheduler.enabled'] = false;
  await scheduler.onApplicationBootstrap(monday);
  assert.equal(monitoringQueue.schedulers.size + postQueue.schedulers.size + eveningQueue.schedulers.size, 0);

  let notified = 0;
  const candidate = { id: 'candidate-1', status: CandidateStatus.NEW };
  const analysis = new CandidateAnalysisService(
    { get: async () => candidate },
    { enrichCandidate: async () => ({ success: true }) },
    { triageCandidate: async () => ({ success: true, routing: { escalate: false } }) },
    { reviewCandidate: async () => { throw new Error('DEEP must not run'); } },
    { finalizeCandidate: async () => {
      candidate.status = CandidateStatus.QUALIFIED;
      return { finalized: true, newStatus: CandidateStatus.QUALIFIED };
    } },
    { notifyCandidate: async () => { notified += 1; } },
  );
  assert.equal((await analysis.run(candidate.id)).qualified, true);
  assert.equal(notified, 1);
  candidate.status = CandidateStatus.NEW;
  const failing = new CandidateAnalysisService(
    { get: async () => candidate },
    { enrichCandidate: async () => ({ success: false, retryable: true, errorCode: 'TIMEOUT' }) },
    {}, {}, {}, {},
  );
  await assert.rejects(() => failing.run(candidate.id), error =>
    error instanceof CandidateStageError && error.stage === 'NEWS' && error.retryable);

  const rows = [];
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const runRepository = {
    create: value => ({ createdAt: new Date(), updatedAt: new Date(), ...value }),
    save: async value => {
      const index = rows.findIndex(row => row.id === value.id);
      const saved = { ...value, updatedAt: new Date() };
      if (index >= 0) rows[index] = saved; else rows.push(saved);
      return saved;
    },
    update: async (id, value) => {
      const row = rows.find(item => item.id === id);
      assert.ok(row, `Unknown pipeline run ${id}`);
      Object.assign(row, value, { updatedAt: new Date() });
      return { affected: 1 };
    },
    findOneBy: async where => rows.find(row => matches(row, where)) || null,
    findOneByOrFail: async where => {
      const row = rows.find(item => matches(item, where));
      assert.ok(row); return row;
    },
    findOne: async ({ where }) => rows.find(row => matches(row, where)) || null,
    existsBy: async where => rows.some(row => matches(row, where)),
  };
  const dataSource = { transaction: async operation => operation({
    query: async () => undefined,
    getRepository: () => runRepository,
  }) };
  const order = [];
  let stale = false;
  const instruments = [
    { id: 'nifty', symbol: 'NIFTY50', type: 'INDEX' },
    { id: 'vix', symbol: 'INDIAVIX', type: 'INDEX' },
    { id: 'equity', symbol: 'RELIANCE', type: 'EQUITY' },
  ];
  const pipelineConfig = { getOrThrow: key => ({
    'marketData.universe': 'VERIFY', 'scheduler.marketDataLookbackDays': 10,
  })[key] };
  const marketData = {
    syncInstruments: async () => { order.push('market-data-sync'); },
    refresh: async id => { order.push(`refresh-${id}`); },
    quality: async id => {
      order.push(`quality-${id}`);
      return stale ? { freshness: 'STALE', validity: 'VALID', completeness: 'COMPLETE',
        latestExpectedSession: '2026-09-20' } :
        { freshness: 'CURRENT', validity: 'VALID', completeness: 'COMPLETE',
          latestExpectedSession: '2026-09-21' };
    },
  };
  let scannerCalls = 0;
  const scanner = { runDailyScan: async () => {
    scannerCalls += 1; order.push('scanner');
    return { run: { id: 'scan-1', marketDate: '2026-09-21' },
      shortlist: [{ id: 'result-1' }] };
  } };
  const candidateEntity = { id: 'candidate-1', scanResultId: 'result-1',
    technicalSnapshot: { close: '100' }, riskSnapshot: { accepted: true } };
  const candidateOrchestration = { createFromScanResult: async () => {
    order.push('candidate');
    return { outcome: 'CREATED', created: true, candidateId: candidateEntity.id,
      candidate: candidateEntity };
  } };
  const queuedCandidates = [];
  const candidateQueue = { add: async (_name, data, opts) => {
    order.push('candidate-enqueue'); queuedCandidates.push({ data, opts }); return { id: opts.jobId };
  } };
  const dailyPipeline = new DailyPipelineService(dataSource, runRepository, pipelineConfig,
    { list: async () => instruments }, marketData, { isTradingDay: async () => true },
    scanner, candidateOrchestration, candidateQueue);
  const firstRun = await dailyPipeline.run({ triggerSource: 'MANUAL', marketDate: '2026-09-21' },
    { updateProgress: async () => undefined });
  assert.equal(firstRun.status, 'CANDIDATE_ANALYSIS_ENQUEUED');
  assert.deepEqual(order, ['market-data-sync', 'refresh-nifty', 'refresh-vix', 'refresh-equity',
    'quality-nifty', 'quality-vix', 'scanner', 'candidate', 'candidate-enqueue']);
  assert.equal(queuedCandidates.length, 1);
  const duplicate = await dailyPipeline.run({ triggerSource: 'MANUAL', marketDate: '2026-09-21' });
  assert.equal(duplicate.reused, true);
  assert.equal(queuedCandidates.length, 1);
  await dailyPipeline.recordCandidateSuccess(firstRun.pipelineRunId, {
    candidateId: candidateEntity.id, newsEnriched: true, fastAnalyzed: true,
    deepAnalyzed: false, qualified: true, wait: false, rejected: false, notified: true,
  });
  assert.equal(rows[0].status, 'SUCCESS');

  stale = true;
  marketData.quality = async id => {
    order.push(`quality-${id}`);
    return { freshness: 'STALE', validity: 'VALID', completeness: 'COMPLETE',
      latestExpectedSession: '2026-09-21' };
  };
  const scannerCallsBeforeFailure = scannerCalls;
  await assert.rejects(() => dailyPipeline.run({ triggerSource: 'MANUAL', marketDate: '2026-09-22' }));
  assert.equal(scannerCalls, scannerCallsBeforeFailure, 'freshness failure must abort before scanner');
  assert.equal(rows.find(row => row.marketDate === '2026-09-22').status, 'FAILED');
  const partial = await runRepository.save({ id: 'partial-run', marketDate: '2026-09-23',
    version: 'daily-pipeline-v1', status: 'STARTED', candidatesTotal: 2, candidatesProcessed: 0,
    candidateAnalysisFailures: 0, newsEnriched: 0, fastAnalyzed: 0, deepAnalyzed: 0,
    qualified: 0, waitCount: 0, rejected: 0, notified: 0, newsFailures: 0,
    aiFailures: 0, notificationFailures: 0, metadata: {}, completedAt: null });
  await dailyPipeline.recordCandidateSuccess(partial.id, { candidateId: 'candidate-ok',
    newsEnriched: true, fastAnalyzed: true, deepAnalyzed: false, qualified: true,
    wait: false, rejected: false, notified: true });
  assert.equal((await runRepository.findOneBy({ id: partial.id })).status, 'STARTED',
    'one candidate must not finalize a two-candidate run');
  await dailyPipeline.recordCandidateFailure(partial.id, 'candidate-failed', 'AI', 'timeout');
  const partialResult = await runRepository.findOneBy({ id: partial.id });
  assert.equal(partialResult.status, 'PARTIAL');
  assert.equal(partialResult.qualified, 1);
  assert.equal(partialResult.aiFailures, 1);

  const migration = readFileSync('database/migrations/V14__create_daily_pipeline_runs.sql', 'utf8');
  assert.match(migration, /UNIQUE \(market_date, version\)/);
  assert.match(migration, /'STARTED', 'SUCCESS', 'PARTIAL', 'FAILED'/);
  const jobsController = readFileSync('src/jobs/jobs.controller.ts', 'utf8');
  for (const route of ['trade-monitor/run', 'post-market/run', 'evening/run']) {
    assert.ok(jobsController.includes(route));
  }
  console.log('PASS: scheduler guards, stable registration, disablement, catch-up, candidate flow, and persistence constraints verified.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
