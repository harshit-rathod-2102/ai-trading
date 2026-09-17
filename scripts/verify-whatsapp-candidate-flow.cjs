// Database-backed WhatsApp candidate/command verification with a fake MessagingProvider.
// No Meta request and no broker/order API call is made.
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');

if (existsSync('.env')) process.loadEnvFile('.env');
process.env.META_WHATSAPP_ALLOWED_SENDER = '919999999999';
process.env.MESSAGING_PROVIDER = 'meta-whatsapp';

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { DataSource } = require('typeorm');
  const { AppModule } = require('../dist/app.module');
  const { CandidateNotificationService } = require('../dist/messaging/candidate-notification.service');
  const { WhatsAppCommandService } = require('../dist/messaging/whatsapp-command.service');
  const { MetaWhatsAppWebhookService } = require('../dist/providers/messaging/meta-whatsapp/meta-whatsapp-webhook.service');
  const { RedisService } = require('../dist/redis/redis.service');
  const { TradeCandidate } = require('../dist/candidates/entities/trade-candidate.entity');
  const { Instrument } = require('../dist/instruments/entities/instrument.entity');
  const { Trade } = require('../dist/trades/entities/trade.entity');
  const { CandidateStatus } = require('../dist/common/enums/candidate-status.enum');
  const { InstrumentType } = require('../dist/common/enums/instrument-type.enum');
  const { MessageDeliveryStatus } = require('../dist/providers/messaging/models/message.enums');
  const { ProviderUnavailableError } = require('../dist/providers/provider-error');
  const { parseWhatsAppCommand } = require('../dist/messaging/command-parser');

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  const apiBase = `http://127.0.0.1:${address.port}/api`;
  const dataSource = app.get(DataSource);
  const candidateRepository = dataSource.getRepository(TradeCandidate);
  const instrumentRepository = dataSource.getRepository(Instrument);
  const tradeRepository = dataSource.getRepository(Trade);
  const notificationService = app.get(CandidateNotificationService);
  const commandService = app.get(WhatsAppCommandService);
  const webhook = app.get(MetaWhatsAppWebhookService);
  const redis = app.get(RedisService);
  const candidateIds = [];
  const instrumentIds = [];
  const dedupKeys = [];
  const outbound = [];
  let nextDelivery = 1;
  let failNext = false;

  const fakeMessaging = {
    sendMessage: async message => {
      outbound.push(message);
      if (failNext) {
        failNext = false;
        throw new ProviderUnavailableError('verification', 'Simulated messaging failure');
      }
      return {
        providerMessageId: `wamid.verify.outbound.${nextDelivery++}`,
        status: MessageDeliveryStatus.ACCEPTED,
        sentAt: null,
        metadata: { verification: true },
      };
    },
  };
  notificationService.messaging = fakeMessaging;
  commandService.messaging = fakeMessaging;

  async function createCandidate(prefix, status = CandidateStatus.QUALIFIED) {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
    const symbol = `${prefix}${suffix}`.slice(0, 32);
    const candidateId = randomUUID();
    const instrumentId = randomUUID();
    const decidedAt = new Date();
    candidateIds.push(candidateId);
    instrumentIds.push(instrumentId);
    await instrumentRepository.save(instrumentRepository.create({
      id: instrumentId,
      symbol,
      exchange: 'NSE',
      name: `${prefix} Verification Limited`,
      type: InstrumentType.EQUITY,
      sector: 'Verification',
      industry: 'Testing',
      provider: 'fixture',
      providerInstrumentId: `whatsapp:${instrumentId}`,
      providerSymbol: symbol,
      providerMetadata: { verification: true },
      isActive: true,
    }));
    return candidateRepository.save(candidateRepository.create({
      id: candidateId,
      symbol,
      exchange: 'NSE',
      strategy: 'MOMENTUM_BREAKOUT',
      strategyVersion: 'momentum-breakout-v1',
      scanRunId: null,
      scanResultId: null,
      marketDate: null,
      scannerVersion: null,
      sector: 'Verification',
      status,
      detectedAt: decidedAt,
      proposedEntry: '2920.0000',
      proposedStop: '2845.0000',
      target1: '3070.0000',
      target2: '3145.0000',
      suggestedQuantity: 33,
      quantScore: '84.2000',
      strategyScore: '84.2000',
      rankingScore: '91.5000',
      globalRankingScore: '90.0000',
      strategyRank: 2,
      strategyQualifiedCount: 10,
      globalRank: 2,
      globalQualifiedCount: 20,
      technicalSnapshot: { trend: 'UP', breakout: true },
      riskSnapshot: {
        riskVersion: 'risk-v1', accepted: true, recommendedQuantity: 33,
        capitalRequired: '96360.0000', plannedLossAtStop: '2475.0000',
        rewardRiskToTarget1: '2.0000', rewardRiskToTarget2: '3.0000', warnings: [],
      },
      marketRegimeSnapshot: { version: 'market-regime-v1', regime: 'BULLISH' },
      strategySnapshot: { qualified: true },
      rankingSnapshot: { globalRank: 2 },
      newsSnapshot: { version: 'candidate-news-v1' },
      newsEnrichedAt: decidedAt,
      aiAnalysis: {
        fast: { summary: 'FAST found no material qualitative issue.',
          bullishFactors: ['Strong persisted breakout structure'], bearishFactors: [], redFlags: [] },
        routing: { version: 'ai-routing-v1', escalate: false },
      },
      decisionSnapshot: {
        version: 'candidate-decision-v1', outcome: 'QUALIFIED', previousStatus: 'NEW',
        status: 'QUALIFIED', sourceTier: 'FAST', reasons: ['No material blocker'], warnings: [],
        fastEvidenceHash: 'a'.repeat(64), routingVersion: 'ai-routing-v1',
        decidedAt: decidedAt.toISOString(),
      },
      decidedAt,
      notificationSnapshot: null,
      notifiedAt: null,
      notificationProviderMessageId: null,
    }));
  }

  async function notifyViaApi(candidateId) {
    const response = await fetch(`${apiBase}/candidates/${candidateId}/notify`, { method: 'POST' });
    return { status: response.status, body: await response.json() };
  }

  function inbound(text, options = {}) {
    return {
      sender: options.sender || '919999999999',
      text,
      providerMessageId: options.providerMessageId || `wamid.verify.inbound.${randomUUID()}`,
      ...(options.replyToProviderMessageId
        ? { replyToProviderMessageId: options.replyToProviderMessageId } : {}),
      receivedAt: new Date().toISOString(),
      metadata: { provider: 'meta-whatsapp', messageType: 'text' },
    };
  }

  function webhookPayload(message) {
    return {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: {
        metadata: { phone_number_id: '123456789', display_phone_number: '15550000000' },
        contacts: [{ wa_id: message.sender, profile: { name: 'Verification User' } }],
        messages: [{
          from: message.sender,
          id: message.providerMessageId,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: 'text',
          ...(message.replyToProviderMessageId
            ? { context: { id: message.replyToProviderMessageId } } : {}),
          text: { body: message.text },
        }],
      } }] }],
    };
  }

  try {
    assert.equal(parseWhatsAppCommand(' Buy TESTCO 2925.5 10. ').success, true);
    assert.equal(parseWhatsAppCommand('BUY 2925 1.5').errorCode, 'INVALID_BUY_QUANTITY');
    assert.equal(parseWhatsAppCommand('SELL TESTCO 3000').errorCode, 'UNKNOWN_COMMAND');

    // A: only a QUALIFIED candidate is delivered, persisted, and journaled.
    const notifiedCandidate = await createCandidate('NOTIFY');
    const beforeNotificationCalls = outbound.length;
    const notification = await notifyViaApi(notifiedCandidate.id);
    assert.equal(notification.status, 200);
    assert.equal(notification.body.notified, true);
    assert.equal(notification.body.newStatus, CandidateStatus.NOTIFIED);
    assert.equal(outbound.length, beforeNotificationCalls + 1);
    const alert = outbound.at(-1);
    assert.match(alert.text, new RegExp(notifiedCandidate.symbol));
    assert.match(alert.text, /Entry: ₹2920\.0000/);
    assert.match(alert.text, /No broker order is placed/);
    assert.ok(alert.text.length < 4096);
    const notifiedPersisted = await candidateRepository.findOneByOrFail({ id: notifiedCandidate.id });
    assert.equal(notifiedPersisted.status, CandidateStatus.NOTIFIED);
    assert.equal(notifiedPersisted.notificationProviderMessageId, notification.body.providerMessageId);
    assert.equal(notifiedPersisted.notificationSnapshot.provider, 'meta-whatsapp');
    const notifiedEvents = await dataSource.query(
      `SELECT event_type, source, data FROM trade_events
       WHERE candidate_id=$1 AND event_type='CANDIDATE_NOTIFIED'`,
      [notifiedCandidate.id],
    );
    assert.equal(notifiedEvents.length, 1);
    assert.equal(notifiedEvents[0].source, 'SYSTEM');

    const detailResponse = await fetch(`${apiBase}/candidates/${notifiedCandidate.id}`);
    const detail = await detailResponse.json();
    assert.equal(detail.notificationProviderMessageId, notification.body.providerMessageId);
    assert.ok(detail.notifiedAt);

    // B: WAIT, REJECTED, and NEW candidates cannot emit actionable alerts.
    for (const status of [CandidateStatus.WAIT, CandidateStatus.REJECTED, CandidateStatus.NEW]) {
      const candidate = await createCandidate(`NO${status.slice(0, 3)}`, status);
      const callCount = outbound.length;
      const response = await notifyViaApi(candidate.id);
      assert.equal(response.status, 409);
      assert.equal(response.body.code, 'CANDIDATE_NOT_ACTIONABLE');
      assert.equal(outbound.length, callCount);
    }

    // C: a second notification reuses metadata and sends nothing.
    const beforeDuplicateNotification = outbound.length;
    const duplicateNotification = await notifyViaApi(notifiedCandidate.id);
    assert.equal(duplicateNotification.body.reusedExistingNotification, true);
    assert.equal(outbound.length, beforeDuplicateNotification);
    assert.equal((await dataSource.query(
      `SELECT COUNT(*)::int AS count FROM trade_events
       WHERE candidate_id=$1 AND event_type='CANDIDATE_NOTIFIED'`,
      [notifiedCandidate.id],
    ))[0].count, 1);

    // D: provider failure leaves the candidate QUALIFIED and retryable.
    const deliveryFailure = await createCandidate('MSGFAIL');
    failNext = true;
    await assert.rejects(notificationService.notifyCandidate(deliveryFailure.id), /Simulated messaging failure/);
    const failedPersisted = await candidateRepository.findOneByOrFail({ id: deliveryFailure.id });
    assert.equal(failedPersisted.status, CandidateStatus.QUALIFIED);
    assert.equal(failedPersisted.notificationSnapshot, null);
    assert.equal(failedPersisted.notificationProviderMessageId, null);

    // E: reply context resolves the notification and reuses transactional BUY logic.
    const replyBuy = await commandService.handle(inbound('BUY 2925 20', {
      replyToProviderMessageId: notification.body.providerMessageId,
    }));
    assert.equal(replyBuy.success, true);
    assert.ok(replyBuy.tradeId);
    assert.equal((await candidateRepository.findOneByOrFail({ id: notifiedCandidate.id })).status,
      CandidateStatus.ACCEPTED);
    const replyTrade = await tradeRepository.findOneByOrFail({ candidateId: notifiedCandidate.id });
    assert.equal(replyTrade.actualEntry, '2925.0000');
    assert.equal(replyTrade.quantity, 20);

    // F: explicit symbol resolution works without reply metadata.
    const symbolCandidate = await createCandidate('SYMBOLBUY');
    const symbolBuy = await commandService.handle(inbound(
      `buy ${symbolCandidate.symbol.toLowerCase()} 2926 10`,
    ));
    assert.equal(symbolBuy.success, true);
    assert.equal(symbolBuy.candidateId, symbolCandidate.id);

    // G: WhatsApp quantity cannot exceed deterministic risk sizing.
    const quantityCandidate = await createCandidate('QTYSAFE');
    const highQuantity = await commandService.handle(inbound(
      `BUY ${quantityCandidate.symbol} 2925 34`,
    ));
    assert.equal(highQuantity.errorCode, 'QUANTITY_EXCEEDS_SUGGESTED');
    assert.equal((await candidateRepository.findOneByOrFail({ id: quantityCandidate.id })).status,
      CandidateStatus.QUALIFIED);
    assert.equal(await tradeRepository.existsBy({ candidateId: quantityCandidate.id }), false);

    // H: Redis provider-message deduplication prevents duplicate BUY and response.
    const dedupCandidate = await createCandidate('DEDUPBUY');
    const dedupNotification = await notificationService.notifyCandidate(dedupCandidate.id);
    const duplicateInbound = inbound('BUY 2925 10', {
      providerMessageId: `wamid.verify.duplicate.${randomUUID()}`,
      replyToProviderMessageId: dedupNotification.providerMessageId,
    });
    const key = `webhook:meta-whatsapp:message:${createHash('sha256')
      .update(duplicateInbound.providerMessageId).digest('hex')}`;
    dedupKeys.push(key);
    const outboundBeforeWebhook = outbound.length;
    const firstWebhook = await webhook.process(webhookPayload(duplicateInbound));
    const secondWebhook = await webhook.process(webhookPayload(duplicateInbound));
    assert.equal(firstWebhook.textMessagesAccepted, 1);
    assert.equal(secondWebhook.duplicatesIgnored, 1);
    assert.equal(outbound.length, outboundBeforeWebhook + 1);
    assert.equal(await tradeRepository.countBy({ candidateId: dedupCandidate.id }), 1);
    assert.equal((await dataSource.query(
      `SELECT COUNT(*)::int AS count FROM trade_events
       WHERE candidate_id=$1 AND event_type='TRADE_OPENED'`, [dedupCandidate.id],
    ))[0].count, 1);

    // I: SKIP uses CandidatesService and records WHATSAPP as the source.
    const skipCandidate = await createCandidate('SKIPME');
    const skipped = await commandService.handle(inbound(`SKIP ${skipCandidate.symbol}`));
    assert.equal(skipped.success, true);
    assert.equal((await candidateRepository.findOneByOrFail({ id: skipCandidate.id })).status,
      CandidateStatus.SKIPPED);
    const skipEvents = await dataSource.query(
      `SELECT source FROM trade_events WHERE candidate_id=$1 AND event_type='CANDIDATE_SKIPPED'`,
      [skipCandidate.id],
    );
    assert.equal(skipEvents.length, 1);
    assert.equal(skipEvents[0].source, 'WHATSAPP');
    const repeatedSkip = await commandService.handle(inbound(`SKIP ${skipCandidate.symbol}`));
    assert.equal(repeatedSkip.errorCode, 'ALREADY_SKIPPED');
    assert.equal((await dataSource.query(
      `SELECT COUNT(*)::int AS count FROM trade_events
       WHERE candidate_id=$1 AND event_type='CANDIDATE_SKIPPED'`, [skipCandidate.id],
    ))[0].count, 1);

    // J: bare SKIP never guesses while several candidates are actionable.
    const ambiguousOne = await createCandidate('AMBIGA');
    const ambiguousTwo = await createCandidate('AMBIGB');
    const ambiguous = await commandService.handle(inbound('SKIP'));
    assert.equal(ambiguous.errorCode, 'AMBIGUOUS_CANDIDATE');
    assert.equal((await candidateRepository.findOneByOrFail({ id: ambiguousOne.id })).status,
      CandidateStatus.QUALIFIED);
    assert.equal((await candidateRepository.findOneByOrFail({ id: ambiguousTwo.id })).status,
      CandidateStatus.QUALIFIED);

    // K: unauthorized webhook sender never reaches command/business services.
    const unauthorizedTarget = await createCandidate('UNAUTH');
    const unauthorized = inbound(`SKIP ${unauthorizedTarget.symbol}`, {
      sender: '918888888888', providerMessageId: `wamid.verify.unauthorized.${randomUUID()}`,
    });
    const outboundBeforeUnauthorized = outbound.length;
    const unauthorizedResult = await webhook.process(webhookPayload(unauthorized));
    assert.equal(unauthorizedResult.unauthorizedIgnored, 1);
    assert.equal(outbound.length, outboundBeforeUnauthorized);
    assert.equal((await candidateRepository.findOneByOrFail({ id: unauthorizedTarget.id })).status,
      CandidateStatus.QUALIFIED);

    // L: malformed BUY receives concise usage help and changes no state.
    const invalid = await commandService.handle(inbound('BUY not-a-price 3'));
    assert.equal(invalid.errorCode, 'INVALID_BUY_PRICE');
    assert.match(invalid.responseText, /BUY <price> <qty>/);

    const status = await commandService.handle(inbound('STATUS'));
    assert.equal(status.success, true);
    assert.match(status.responseText, /Qualified candidates awaiting decision/);
    assert.match(status.responseText, /Open tracked trades/);

    console.log('PASS: WhatsApp candidate delivery and command scenarios A-L, STATUS, parser, sender auth, and Redis deduplication.');
  } finally {
    for (const key of dedupKeys) await redis.getClient().del(key);
    if (candidateIds.length) {
      await dataSource.query('DELETE FROM trade_events WHERE candidate_id = ANY($1::uuid[])', [candidateIds]);
      await dataSource.query('DELETE FROM trades WHERE candidate_id = ANY($1::uuid[])', [candidateIds]);
      await dataSource.query('DELETE FROM trade_candidates WHERE id = ANY($1::uuid[])', [candidateIds]);
    }
    if (instrumentIds.length) await dataSource.query('DELETE FROM instruments WHERE id = ANY($1::uuid[])', [instrumentIds]);
    await app.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
