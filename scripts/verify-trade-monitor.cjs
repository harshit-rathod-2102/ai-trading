// Database-backed TradeMonitor verification using fake current-price and messaging adapters.
// No Upstox, Meta, or broker request is made.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');

if (existsSync('.env')) process.loadEnvFile('.env');
process.env.MARKET_DATA_PROVIDER = 'fixture';
process.env.MESSAGING_PROVIDER = 'meta-whatsapp';
process.env.META_WHATSAPP_ALLOWED_SENDER = '919999999999';

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { DataSource } = require('typeorm');
  const { AppModule } = require('../dist/app.module');
  const { TradeMonitorService } = require('../dist/trade-monitor/trade-monitor.service');
  const { TradeMonitorAlertService } = require('../dist/trade-monitor/trade-monitor-alert.service');
  const { TradeCandidate } = require('../dist/candidates/entities/trade-candidate.entity');
  const { Instrument } = require('../dist/instruments/entities/instrument.entity');
  const { Trade } = require('../dist/trades/entities/trade.entity');
  const { CandidateStatus } = require('../dist/common/enums/candidate-status.enum');
  const { TradeStatus } = require('../dist/common/enums/trade-status.enum');
  const { InstrumentType } = require('../dist/common/enums/instrument-type.enum');
  const { MessageDeliveryStatus } = require('../dist/providers/messaging/models/message.enums');
  const { calculateTradePnl } = require('../dist/trade-monitor/calculations/trade-pnl');
  const { calculateRMultiple } = require('../dist/trade-monitor/calculations/trade-r-multiple');
  const { calculateExcursion } = require('../dist/trade-monitor/calculations/excursion');
  const {
    mapUpstoxLatestPrice,
  } = require('../dist/providers/market-data/upstox/mappers/upstox-latest-price.mapper');
  const {
    UpstoxMarketDataProvider,
  } = require('../dist/providers/market-data/upstox/upstox-market-data.provider');

  assert.deepEqual(calculateTradePnl('105', '100', 10), {
    unrealizedPnl: '50.0000',
    unrealizedPnlPercent: '5.0000',
  });
  assert.equal(calculateRMultiple('105', '100', '95'), '1.0000');
  assert.deepEqual(calculateExcursion('98', '100', '95', '104', null), {
    maxFavorablePrice: '104.0000',
    maxFavorableR: '0.8000',
    maxAdversePrice: '98.0000',
    maxAdverseR: '-0.4000',
  });
  assert.equal(
    mapUpstoxLatestPrice({
      last_price: 101.25,
      timestamp: '2026-09-19T09:15:00+05:30',
    }).price,
    '101.25',
  );
  const upstoxPaths = [];
  const upstox = new UpstoxMarketDataProvider({
    getJson: async (path) => {
      upstoxPaths.push(path);
      return {
        status: 'success',
        data: {
          TEST: {
            instrument_token: 'NSE_EQ|VERIFY',
            last_price: 101.25,
            timestamp: '2026-09-19T09:15:00+05:30',
          },
        },
      };
    },
  });
  const upstoxQuote = await upstox.getLatestPrice({
    instrument: {
      symbol: 'VERIFY',
      exchange: 'NSE',
      instrumentType: 'EQUITY',
      providerInstrumentId: 'NSE_EQ|VERIFY',
    },
  });
  assert.equal(upstoxQuote.price, '101.25');
  assert.equal(upstoxPaths[0], '/v3/market-quote/quotes?instrument_key=NSE_EQ%7CVERIFY');

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const sessionStart = Date.parse(`${today}T09:15:00+05:30`);
  const sessionEnd = Date.parse(`${today}T15:30:00+05:30`);
  const calendarPaths = [];
  const calendarProvider = new UpstoxMarketDataProvider({
    getJson: async (path) => {
      calendarPaths.push(path);
      if (path.startsWith('/v3/historical-candle/')) {
        return { status: 'success', data: { candles: [] } };
      }
      return {
        status: 'success',
        data: [
          {
            exchange: 'NSE',
            start_time: sessionStart,
            end_time: sessionEnd,
          },
        ],
      };
    },
  });
  const currentCalendar = await calendarProvider.getTradingCalendar({
    exchange: 'NSE',
    from: today,
    to: today,
  });
  assert.deepEqual(currentCalendar.sessions, [
    {
      date: today,
      closeAt: new Date(sessionEnd).toISOString(),
    },
  ]);
  assert.deepEqual(calendarPaths, [`/v2/market/timings/${today}`]);

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  const apiBase = `http://127.0.0.1:${address.port}/api`;
  const dataSource = app.get(DataSource);
  const candidateRepository = dataSource.getRepository(TradeCandidate);
  const instrumentRepository = dataSource.getRepository(Instrument);
  const tradeRepository = dataSource.getRepository(Trade);
  const monitor = app.get(TradeMonitorService);
  const alertService = app.get(TradeMonitorAlertService);
  const candidateIds = [];
  const instrumentIds = [];
  const tradeIds = [];
  const quotes = new Map();
  const providerFailures = new Set();
  const outbound = [];
  let nextMessage = 1;
  let failNextMessage = false;

  const fakeMarketData = {
    latestPrice: async (instrumentId) => {
      if (providerFailures.has(instrumentId)) throw new Error('Simulated quote failure');
      const quote = quotes.get(instrumentId);
      if (!quote) throw new Error(`No verification quote for ${instrumentId}`);
      return { instrumentId, ...quote };
    },
  };
  const fakeMessaging = {
    sendMessage: async (message) => {
      outbound.push(message);
      if (failNextMessage) {
        failNextMessage = false;
        throw new Error('Simulated alert delivery failure');
      }
      return {
        providerMessageId: `wamid.monitor.verify.${nextMessage++}`,
        status: MessageDeliveryStatus.ACCEPTED,
        sentAt: null,
      };
    },
  };
  monitor.marketData = fakeMarketData;
  alertService.messaging = fakeMessaging;

  async function createTrade(prefix, options = {}) {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
    const symbol = `${prefix}${suffix}`.slice(0, 32);
    const candidateId = randomUUID();
    const instrumentId = randomUUID();
    const tradeId = randomUUID();
    const entry = options.entry || '100.0000';
    const stop = options.stop || '95.0000';
    const target1 = options.target1 === undefined ? '112.0000' : options.target1;
    const target2 = options.target2 === undefined ? '115.0000' : options.target2;
    const quantity = options.quantity || 10;
    const status = options.status || TradeStatus.OPEN;
    candidateIds.push(candidateId);
    instrumentIds.push(instrumentId);
    tradeIds.push(tradeId);
    await instrumentRepository.save(
      instrumentRepository.create({
        id: instrumentId,
        symbol,
        exchange: 'NSE',
        name: `${prefix} Monitor Verification Limited`,
        type: InstrumentType.EQUITY,
        sector: 'Verification',
        industry: 'Testing',
        provider: 'fixture',
        providerInstrumentId: `monitor:${instrumentId}`,
        providerSymbol: symbol,
        providerMetadata: { verification: true },
        isActive: true,
      }),
    );
    await candidateRepository.save(
      candidateRepository.create({
        id: candidateId,
        symbol,
        exchange: 'NSE',
        strategy: 'MOMENTUM_BREAKOUT',
        strategyVersion: 'momentum-breakout-v1',
        sector: 'Verification',
        status: CandidateStatus.ACCEPTED,
        detectedAt: new Date(Date.now() - 86_400_000),
        proposedEntry: entry,
        proposedStop: stop,
        target1,
        target2,
        suggestedQuantity: quantity,
        quantScore: '85.0000',
        technicalSnapshot: { verification: true },
        riskSnapshot: { verification: true },
        aiAnalysis: null,
      }),
    );
    const risk = (Number(entry) - Number(stop)) * quantity;
    const trade = await tradeRepository.save(
      tradeRepository.create({
        id: tradeId,
        candidateId,
        symbol,
        strategy: 'MOMENTUM_BREAKOUT',
        strategyVersion: 'momentum-breakout-v1',
        status,
        entryDecisionAt: new Date(Date.now() - 86_400_000),
        plannedEntry: entry,
        actualEntry: entry,
        quantity,
        initialStop: stop,
        currentStop: stop,
        target1,
        target2,
        initialRiskAmount: risk.toFixed(4),
        currentPrice: null,
        unrealizedPnl: null,
        unrealizedPnlPercent: null,
        currentR: null,
        maxFavorablePrice: null,
        maxFavorableR: null,
        maxAdversePrice: null,
        maxAdverseR: null,
        lastPriceObservedAt: null,
        lastMonitoredAt: null,
        monitoringVersion: null,
        realizedPnl: '0.0000',
        closedAt: status === TradeStatus.OPEN ? null : new Date(),
      }),
    );
    setPrice({ instrumentId }, entry);
    return { trade, instrumentId, candidateId };
  }

  function setPrice(subject, price, ageMs = 0) {
    quotes.set(subject.instrumentId, {
      symbol: subject.trade?.symbol || 'VERIFY',
      price: Number(price).toFixed(4),
      observedAt: new Date(Date.now() - ageMs).toISOString(),
      provider: 'verification-quote',
      isSynthetic: false,
    });
  }

  async function monitorViaApi(tradeId) {
    const response = await fetch(`${apiBase}/trade-monitor/trades/${tradeId}`, { method: 'POST' });
    const body = await response.json();
    return { status: response.status, body };
  }

  async function monitorEventCount(tradeId, key) {
    const rows = await dataSource.query(
      `SELECT COUNT(*)::int AS count FROM trade_events
       WHERE trade_id=$1 AND data->>'monitorKey'=$2`,
      [tradeId, key],
    );
    return rows[0].count;
  }

  try {
    // A: +0.5R updates metrics without a milestone.
    const belowOne = await createTrade('BELOWONE');
    setPrice(belowOne, '102.5000');
    const belowResult = await monitorViaApi(belowOne.trade.id);
    assert.equal(belowResult.status, 200);
    assert.equal(belowResult.body.currentR, '0.5000');
    assert.equal(belowResult.body.unrealizedPnl, '25.0000');
    assert.equal(belowResult.body.alerts.length, 0);
    assert.equal(await monitorEventCount(belowOne.trade.id, 'PLUS_1R'), 0);

    // B: +1R is journaled and delivered once, with persistent MFE.
    setPrice(belowOne, '105.2500');
    const outboundBeforeOneR = outbound.length;
    const oneR = await monitor.monitorTrade(belowOne.trade.id);
    assert.equal(oneR.currentR, '1.0500');
    assert.equal(oneR.maxFavorablePrice, '105.2500');
    assert.equal(oneR.alerts.filter((item) => item.type === 'PLUS_1R').length, 1);
    assert.equal(outbound.length, outboundBeforeOneR + 1);
    assert.equal(await monitorEventCount(belowOne.trade.id, 'PLUS_1R'), 1);

    // C: falling below and revisiting +1R does not duplicate event or delivery.
    setPrice(belowOne, '104.0000');
    await monitor.monitorTrade(belowOne.trade.id);
    setPrice(belowOne, '106.0000');
    const beforeRevisit = outbound.length;
    await monitor.monitorTrade(belowOne.trade.id);
    assert.equal(await monitorEventCount(belowOne.trade.id, 'PLUS_1R'), 1);
    assert.equal(outbound.length, beforeRevisit);

    // D: +2R is an independent milestone.
    setPrice(belowOne, '110.2500');
    const twoR = await monitor.monitorTrade(belowOne.trade.id);
    assert.equal(
      twoR.alerts.some((item) => item.type === 'PLUS_2R'),
      true,
    );
    assert.equal(await monitorEventCount(belowOne.trade.id, 'PLUS_2R'), 1);

    // E: configured adverse movement creates one warning.
    const adverse = await createTrade('ADVERSE');
    setPrice(adverse, '97.5000');
    const adverseResult = await monitor.monitorTrade(adverse.trade.id);
    assert.equal(adverseResult.currentR, '-0.5000');
    assert.equal(
      adverseResult.alerts.some((item) => item.type === 'ADVERSE_MOVE'),
      true,
    );

    // F: stop proximity suppresses the less-specific adverse warning.
    const proximity = await createTrade('PROXIMITY');
    setPrice(proximity, '96.0000');
    const proximityResult = await monitor.monitorTrade(proximity.trade.id);
    assert.equal(proximityResult.stopDistanceR, '0.2000');
    assert.deepEqual(
      proximityResult.alerts.map((item) => item.type),
      ['STOP_PROXIMITY'],
    );

    // G: a breach is observed, but status, stop, and quantity do not mutate.
    const breached = await createTrade('BREACHED');
    setPrice(breached, '94.0000');
    const breachResult = await monitor.monitorTrade(breached.trade.id);
    assert.equal(
      breachResult.alerts.some((item) => item.type === 'STOP_BREACHED'),
      true,
    );
    const breachPersisted = await tradeRepository.findOneByOrFail({ id: breached.trade.id });
    assert.equal(breachPersisted.status, TradeStatus.OPEN);
    assert.equal(breachPersisted.currentStop, '95.0000');
    assert.equal(breachPersisted.quantity, 10);

    // H: target reach is observed without partial exit or closure.
    const target = await createTrade('TARGET', { stop: '90.0000', target1: '105.0000' });
    setPrice(target, '105.0000');
    const targetResult = await monitor.monitorTrade(target.trade.id);
    assert.equal(
      targetResult.alerts.some((item) => item.type === 'TARGET1_REACHED'),
      true,
    );
    const targetPersisted = await tradeRepository.findOneByOrFail({ id: target.trade.id });
    assert.equal(targetPersisted.status, TradeStatus.OPEN);
    assert.equal(targetPersisted.quantity, 10);
    setPrice(target, '116.0000');
    const targetTwoResult = await monitor.monitorTrade(target.trade.id);
    assert.equal(
      targetTwoResult.alerts.some((item) => item.type === 'TARGET2_REACHED'),
      true,
    );
    assert.equal(await monitorEventCount(target.trade.id, 'TARGET1_REACHED'), 1);
    assert.equal(await monitorEventCount(target.trade.id, 'TARGET2_REACHED'), 1);

    // I: MFE only rises and MAE only falls across persisted observations.
    const excursion = await createTrade('EXCURSION');
    setPrice(excursion, '104.0000');
    await monitor.monitorTrade(excursion.trade.id);
    setPrice(excursion, '98.0000');
    await monitor.monitorTrade(excursion.trade.id);
    setPrice(excursion, '103.0000');
    await monitor.monitorTrade(excursion.trade.id);
    const excursionPersisted = await tradeRepository.findOneByOrFail({ id: excursion.trade.id });
    assert.equal(excursionPersisted.maxFavorablePrice, '104.0000');
    assert.equal(excursionPersisted.maxFavorableR, '0.8000');
    assert.equal(excursionPersisted.maxAdversePrice, '98.0000');
    assert.equal(excursionPersisted.maxAdverseR, '-0.4000');
    assert.ok(excursionPersisted.lastMonitoredAt);

    // Alert failures preserve factual state/event and retry on the next pass.
    const deliveryFailure = await createTrade('ALERTFAIL');
    setPrice(deliveryFailure, '105.5000');
    failNextMessage = true;
    const failedAlert = await monitor.monitorTrade(deliveryFailure.trade.id);
    assert.equal(failedAlert.alerts[0].deliveryStatus, 'FAILED');
    assert.equal(await monitorEventCount(deliveryFailure.trade.id, 'PLUS_1R'), 1);
    assert.equal(
      (await tradeRepository.findOneByOrFail({ id: deliveryFailure.trade.id })).currentR,
      '1.1000',
    );
    setPrice(deliveryFailure, '105.5000');
    const retriedAlert = await monitor.monitorTrade(deliveryFailure.trade.id);
    assert.equal(retriedAlert.alerts[0].deliveryStatus, 'SENT');
    assert.equal(retriedAlert.alerts[0].isNew, false);
    assert.equal(await monitorEventCount(deliveryFailure.trade.id, 'PLUS_1R'), 1);
    const deliveryRows = await dataSource.query(
      `SELECT data #>> '{alertDelivery,status}' AS status FROM trade_events
       WHERE trade_id=$1 AND data->>'monitorKey'='PLUS_1R'`,
      [deliveryFailure.trade.id],
    );
    assert.equal(deliveryRows[0].status, 'SENT');

    // J: one provider failure does not stop the batch.
    const batchGood = await createTrade('BATCHGOOD');
    const batchBad = await createTrade('BATCHBAD');
    setPrice(batchGood, '102.0000');
    setPrice(batchBad, '102.0000');
    providerFailures.add(batchBad.instrumentId);
    const originalFind = monitor.trades.find.bind(monitor.trades);
    monitor.trades.find = async () => [batchGood.trade, batchBad.trade];
    let batchResponse;
    let batch;
    try {
      batchResponse = await fetch(`${apiBase}/trade-monitor/run`, { method: 'POST' });
      batch = await batchResponse.json();
    } finally {
      monitor.trades.find = originalFind;
    }
    assert.equal(batchResponse.status, 200);
    assert.equal(batch.totalOpenTrades, 2);
    assert.equal(batch.failed, 1);
    assert.equal(batch.monitored, 1);
    assert.equal(batch.failures[0].tradeId, batchBad.trade.id);
    providerFailures.delete(batchBad.instrumentId);

    // K: stale provider data produces no metrics or events.
    const stale = await createTrade('STALE');
    setPrice(stale, '110.0000', 10 * 60 * 1000);
    await assert.rejects(
      monitor.monitorTrade(stale.trade.id),
      (error) => error.getResponse?.().code === 'STALE_MARKET_PRICE',
    );
    const stalePersisted = await tradeRepository.findOneByOrFail({ id: stale.trade.id });
    assert.equal(stalePersisted.lastMonitoredAt, null);
    assert.equal(await monitorEventCount(stale.trade.id, 'PLUS_1R'), 0);

    const closed = await createTrade('CLOSED', { status: TradeStatus.CLOSED });
    setPrice(closed, '105.0000');
    await assert.rejects(
      monitor.monitorTrade(closed.trade.id),
      (error) => error.getResponse?.().code === 'TRADE_NOT_OPEN',
    );

    // L: concurrent requests coalesce and create one event/alert.
    const concurrent = await createTrade('CONCURRENT');
    setPrice(concurrent, '105.5000');
    const beforeConcurrent = outbound.length;
    const [concurrentOne, concurrentTwo] = await Promise.all([
      monitor.monitorTrade(concurrent.trade.id),
      monitor.monitorTrade(concurrent.trade.id),
    ]);
    assert.equal(concurrentOne.monitoredAt, concurrentTwo.monitoredAt);
    assert.equal(await monitorEventCount(concurrent.trade.id, 'PLUS_1R'), 1);
    assert.equal(outbound.length, beforeConcurrent + 1);
    await assert.rejects(
      dataSource.query(
        `INSERT INTO trade_events
       (id, trade_id, candidate_id, event_type, source, price, quantity, data)
       VALUES ($1,$2,$3,'PRICE_MILESTONE_REACHED','SYSTEM','105.5000',10,$4::jsonb)`,
        [
          randomUUID(),
          concurrent.trade.id,
          concurrent.candidateId,
          JSON.stringify({ monitorKey: 'PLUS_1R', alertType: 'PLUS_1R' }),
        ],
      ),
      (error) => error.driverError?.code === '23505',
    );

    console.log(
      'PASS: TradeMonitor scenarios A-L, calculations, persistence, alert retry, batch isolation, stale-price safety, and concurrency.',
    );
  } finally {
    if (tradeIds.length) {
      await dataSource.query('DELETE FROM trade_events WHERE trade_id = ANY($1::uuid[])', [
        tradeIds,
      ]);
      await dataSource.query('DELETE FROM trades WHERE id = ANY($1::uuid[])', [tradeIds]);
    }
    if (candidateIds.length) {
      await dataSource.query('DELETE FROM trade_events WHERE candidate_id = ANY($1::uuid[])', [
        candidateIds,
      ]);
      await dataSource.query('DELETE FROM trade_candidates WHERE id = ANY($1::uuid[])', [
        candidateIds,
      ]);
    }
    if (instrumentIds.length) {
      await dataSource.query('DELETE FROM instruments WHERE id = ANY($1::uuid[])', [instrumentIds]);
    }
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
