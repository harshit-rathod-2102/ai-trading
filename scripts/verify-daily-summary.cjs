const assert = require('node:assert/strict');
require('reflect-metadata');

async function main() {
  const { DailySummaryService } = require('../dist/daily-summary/daily-summary.service');
  const { DailySummaryMessageBuilder } = require('../dist/daily-summary/daily-summary-message.builder');
  const { DailySummaryStatus } = require('../dist/daily-summary/entities/daily-summary.entity');
  const { DailyPipelineStatus, JobTriggerSource } = require('../dist/jobs/models/job-data.model');
  const { EveningService } = require('../dist/jobs/services/evening.service');
  const { EveningProcessor } = require('../dist/jobs/processors/evening.processor');
  const { CandidateStatus } = require('../dist/common/enums/candidate-status.enum');
  const { TradeStatus } = require('../dist/common/enums/trade-status.enum');
  const { TradeEventType } = require('../dist/common/enums/trade-event-type.enum');
  const { ScanStatus } = require('../dist/scanner/models/scan-status.enum');
  const { MessageDeliveryStatus } = require('../dist/providers/messaging/models/message.enums');
  const { marketClock } = require('../dist/common/utils/market-time');

  const marketDate = marketClock(new Date()).marketDate;
  const observedAt = new Date();
  const values = {
    'dailySummary.maxCandidates': 5,
    'dailySummary.maxTrades': 8,
    'dailySummary.priceStaleMinutes': 360,
    'dailySummary.maxMessageLength': 4000,
    'dailySummary.sendLeaseMinutes': 15,
    'metaWhatsapp.allowedSender': '919999999999',
    'providers.messaging': 'fixture-messaging',
    'scheduler.timezone': 'Asia/Kolkata',
  };
  const config = {
    get: key => values[key],
    getOrThrow: key => {
      assert.ok(key in values, `Missing fake config ${key}`);
      return values[key];
    },
  };

  function pipeline(overrides = {}) {
    return {
      id: 'pipeline-1', marketDate, version: 'daily-pipeline-v1',
      status: DailyPipelineStatus.SUCCESS, marketDataStatus: 'CURRENT', scannerRunId: 'scan-1',
      candidateAnalysisFailures: 0, newsFailures: 0, aiFailures: 0, notificationFailures: 0,
      errorMessage: null, updatedAt: observedAt, ...overrides,
    };
  }
  function scan(overrides = {}) {
    return {
      id: 'scan-1', marketDate, status: ScanStatus.SUCCESS, totalUniverse: 482,
      evaluatedSymbols: 470, qualifiedSetups: 21, shortlistedSetups: 8,
      startedAt: observedAt, marketRegimeSnapshot: {
        regime: 'BULLISH', score: '61.0000', confidence: 'HIGH', warnings: [],
      }, ...overrides,
    };
  }
  function candidate(id, outcome, rank, overrides = {}) {
    const statuses = {
      QUALIFIED: CandidateStatus.NOTIFIED,
      WAIT: CandidateStatus.WAIT,
      REJECTED: CandidateStatus.REJECTED,
    };
    return {
      id, marketDate, symbol: `SYM${id}`, strategy: 'MOMENTUM_BREAKOUT',
      status: statuses[outcome], proposedEntry: '100.0000', proposedStop: '95.0000',
      suggestedQuantity: 20, quantScore: '80.0000', strategyScore: '82.0000',
      rankingScore: `${90 - rank}.0000`, globalRank: rank,
      decisionSnapshot: { outcome }, riskSnapshot: { plannedLossAtStop: '100.0000' },
      aiAnalysis: { fast: { summary: 'Clean persisted evidence.', redFlags: [] } },
      notificationSnapshot: outcome === 'QUALIFIED' ? { status: 'SENT' } : null,
      notifiedAt: outcome === 'QUALIFIED' ? observedAt : null,
      ...overrides,
    };
  }
  function trade(id, overrides = {}) {
    return {
      id, candidateId: `candidate-${id}`, symbol: `TRADE${id}`, strategy: 'TREND_PULLBACK',
      status: TradeStatus.OPEN, actualEntry: '100.0000', quantity: 10,
      currentPrice: '108.0000', currentStop: '98.0000', currentR: '1.6000',
      unrealizedPnl: '80.0000', initialRiskAmount: '50.0000', realizedPnl: '0.0000',
      lastPriceObservedAt: observedAt, createdAt: observedAt, ...overrides,
    };
  }
  function exitEvent(id, price, quantity) {
    return {
      id, eventType: TradeEventType.TRADE_CLOSED, price, quantity,
      trade: { actualEntry: '100.0000' }, data: null, createdAt: observedAt,
    };
  }

  const baseFixture = () => ({
    pipelines: [pipeline()],
    regimes: [{ id: 'regime-1', marketDate, regime: 'BULLISH', score: '61.0000',
      confidence: 'HIGH', warnings: [], calculatedAt: observedAt }],
    scans: [scan()],
    candidates: [candidate('1', 'QUALIFIED', 1), candidate('2', 'WAIT', 2),
      candidate('3', 'REJECTED', 3)],
    openTrades: [trade('1')], closedTrades: [], events: [], summaries: [],
  });

  function createRepository(rows, behavior = {}) {
    return {
      create: value => ({ createdAt: new Date(), updatedAt: new Date(), ...value }),
      save: async value => {
        const saved = { ...value, updatedAt: new Date() };
        const index = rows.findIndex(row => row.id === saved.id);
        if (index >= 0) rows[index] = saved; else rows.push(saved);
        return saved;
      },
      findOneBy: async where => rows.find(row => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null,
      findOne: async options => behavior.findOne ? behavior.findOne(options) : rows[0] ?? null,
      find: async options => behavior.find ? behavior.find(options) : [...rows],
    };
  }

  function harness(fixture = baseFixture()) {
    const summaryRepo = createRepository(fixture.summaries);
    const pipelineRepo = createRepository(fixture.pipelines);
    const regimeRepo = createRepository(fixture.regimes);
    const scanRepo = createRepository(fixture.scans, {
      findOne: options => fixture.scans.find(row => !options.where.id || row.id === options.where.id) ?? null,
    });
    const candidateRepo = createRepository(fixture.candidates);
    const tradeRepo = createRepository([], {
      find: options => options.where.closedAt ? [...fixture.closedTrades] : [...fixture.openTrades],
    });
    const eventRepo = createRepository(fixture.events);
    const dataSource = {
      transaction: async work => work({
        query: async () => undefined,
        getRepository: () => summaryRepo,
      }),
    };
    const sent = [];
    let failNext = false;
    const messaging = {
      sendMessage: async request => {
        sent.push(request);
        if (failNext) {
          failNext = false;
          throw new Error('simulated provider outage');
        }
        return {
          status: MessageDeliveryStatus.ACCEPTED,
          providerMessageId: `message-${sent.length}`,
          sentAt: new Date().toISOString(),
        };
      },
    };
    const profileService = { getActiveProfile: async () => ({
      accountCapital: '500000.0000', riskPerTradePercent: '1.0000',
      maxPositionPercent: '20.0000', maxOpenPortfolioRiskPercent: '2.5000',
      maxSectorExposurePercent: '30.0000', maxOpenTrades: 5,
    }) };
    const portfolioRiskReader = { loadOpenTrades: async () => fixture.openTrades.map(row => ({
      symbol: row.symbol, quantity: row.quantity, actualEntry: row.actualEntry,
      currentPrice: row.currentPrice, currentStop: row.currentStop,
      currentPositionValue: row.currentPrice ? `${Number(row.currentPrice) * row.quantity}` : null,
      sector: 'Technology', isPartiallyClosed: row.status === TradeStatus.PARTIALLY_CLOSED,
    })) };
    const builder = new DailySummaryMessageBuilder(config);
    const service = new DailySummaryService(
      dataSource, config, messaging, profileService, portfolioRiskReader, builder,
      summaryRepo, pipelineRepo, regimeRepo, scanRepo, candidateRepo, tradeRepo, eventRepo,
    );
    return { fixture, service, builder, sent, failNext: () => { failNext = true; } };
  }

  // A: normal day contains all major persisted-state sections.
  const normal = harness();
  const normalPreview = await normal.service.preview(marketDate);
  assert.equal(normalPreview.summary.market.regime, 'BULLISH');
  assert.equal(normalPreview.summary.scan.evaluatedSymbols, 470);
  assert.deepEqual({
    qualified: normalPreview.summary.candidates.qualifiedCount,
    wait: normalPreview.summary.candidates.waitCount,
    rejected: normalPreview.summary.candidates.rejectedCount,
  }, { qualified: 1, wait: 1, rejected: 1 });
  assert.equal(normalPreview.summary.portfolio.unrealizedPnl, '80.0000');
  assert.equal(normalPreview.summary.portfolio.openRisk, '100.0000');
  assert.match(normalPreview.message, /482 stocks in universe/);
  assert.match(normalPreview.message, /Top Candidates/);
  assert.match(normalPreview.message, /Open Trade Details/);

  // B: successful scan and no qualified rows is explicitly a no-opportunity day.
  const noCandidatesFixture = baseFixture();
  noCandidatesFixture.candidates = [candidate('2', 'WAIT', 2), candidate('3', 'REJECTED', 3)];
  const noCandidates = await harness(noCandidatesFixture).service.preview(marketDate);
  assert.match(noCandidates.message, /No qualified setups today\./);
  assert.doesNotMatch(noCandidates.message, /Scan failed/);

  // C: no open trades keeps a valid portfolio section.
  const noTradesFixture = baseFixture();
  noTradesFixture.openTrades = [];
  const noTrades = await harness(noTradesFixture).service.preview(marketDate);
  assert.match(noTrades.message, /No open trades\./);
  assert.equal(noTrades.summary.portfolio.openRisk, '0.0000');

  // D: PARTIAL remains reportable and preserves the useful candidate/trade state.
  const partialFixture = baseFixture();
  partialFixture.pipelines = [pipeline({ status: DailyPipelineStatus.PARTIAL,
    candidateAnalysisFailures: 2, aiFailures: 2 })];
  const partial = await harness(partialFixture).service.preview(marketDate);
  assert.match(partial.message, /Pipeline: PARTIAL/);
  assert.ok(partial.summary.warnings.some(warning => warning.includes('Pipeline is PARTIAL')));
  assert.equal(partial.summary.candidates.qualifiedCount, 1);

  // E: failed scan is not rendered as zero opportunities.
  const failedScanFixture = baseFixture();
  failedScanFixture.scans = [scan({ status: ScanStatus.FAILED })];
  failedScanFixture.candidates = [];
  const failedScan = await harness(failedScanFixture).service.preview(marketDate);
  assert.match(failedScan.message, /Scan failed \/ data unavailable/);
  assert.doesNotMatch(failedScan.message, /No qualified setups today\./);

  // F: persisted but old observations are labeled stale in model, text, and warning.
  const staleFixture = baseFixture();
  staleFixture.openTrades = [trade('1', { lastPriceObservedAt: new Date('2020-01-01T10:00:00.000Z') })];
  const stale = await harness(staleFixture).service.preview(marketDate);
  assert.equal(stale.summary.trades[0].priceStatus, 'STALE');
  assert.match(stale.message, /STALE/);
  assert.ok(stale.summary.warnings.some(warning => warning.includes('price(s) are stale')));

  // G: every actual exit execution contributes to today's realized P&L, including a partial exit.
  const exitsFixture = baseFixture();
  exitsFixture.events = [exitEvent('exit-1', '110.0000', 4), exitEvent('exit-2', '120.0000', 6)];
  const exits = await harness(exitsFixture).service.preview(marketDate);
  assert.equal(exits.summary.portfolio.realizedPnlToday, '160.0000');

  // H: repeated send reuses the SENT record and does not call the provider twice.
  const duplicate = harness();
  const first = await duplicate.service.sendSummary(marketDate);
  const second = await duplicate.service.sendSummary(marketDate);
  assert.equal(first.status, DailySummaryStatus.SENT);
  assert.equal(second.reusedExistingDelivery, true);
  assert.equal(duplicate.sent.length, 1);

  // I: a failed delivery preserves its exact snapshot/message and can be retried.
  const retry = harness();
  retry.failNext();
  await assert.rejects(() => retry.service.sendSummary(marketDate));
  assert.equal(retry.fixture.summaries[0].status, DailySummaryStatus.FAILED);
  const preservedMessage = retry.fixture.summaries[0].messageText;
  const retried = await retry.service.sendSummary(marketDate);
  assert.equal(retried.status, DailySummaryStatus.SENT);
  assert.equal(retried.message, preservedMessage);
  assert.equal(retry.fixture.summaries[0].deliveryAttempts, 2);
  assert.equal(retry.sent.length, 2);

  // J: the BullMQ processor delegates to EveningService, which calls DailySummaryService once.
  let eveningSummaryCalls = 0;
  const eveningService = new EveningService(
    { getFailed: async () => [] },
    { sendSummary: async date => {
      eveningSummaryCalls += 1;
      assert.equal(date, marketDate);
      return { summaryId: 'summary-evening', status: DailySummaryStatus.SENT,
        reusedExistingDelivery: false };
    } },
  );
  const eveningProcessor = new EveningProcessor(eveningService, config);
  const eveningResult = await eveningProcessor.process({
    id: 'evening-job', name: 'EVENING_SUMMARY', attemptsMade: 0,
    data: { triggerSource: JobTriggerSource.MANUAL },
  });
  assert.equal(eveningSummaryCalls, 1);
  assert.equal(eveningResult.summaryStatus, DailySummaryStatus.SENT);

  // K: a crowded summary is compacted within the configured practical limit.
  const longFixture = baseFixture();
  longFixture.candidates = Array.from({ length: 30 }, (_, index) => candidate(
    `LONG${index}`, 'QUALIFIED', index + 1,
    { symbol: `VERYLONGSYMBOL${index}`, aiAnalysis: { fast: {
      summary: 'Persisted analysis detail '.repeat(20), redFlags: ['Persisted risk detail '.repeat(10)],
    } } },
  ));
  longFixture.openTrades = Array.from({ length: 20 }, (_, index) => trade(`LONG${index}`));
  const longSummary = await harness(longFixture).service.preview(marketDate);
  assert.ok(longSummary.message.length <= values['dailySummary.maxMessageLength']);
  assert.match(longSummary.message, /Portfolio/);
  assert.match(longSummary.message, /Top Candidates/);

  console.log('PASS: Daily Summary scenarios A-K verified (aggregation, failure states, P&L, idempotency, retry, evening job, and length limits).');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
