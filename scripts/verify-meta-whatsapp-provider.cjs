const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { MetaWhatsAppClient } = require('../dist/providers/messaging/meta-whatsapp/meta-whatsapp-client');
const { MetaWhatsAppProvider } = require('../dist/providers/messaging/meta-whatsapp/meta-whatsapp.provider');
const { MetaWhatsAppWebhookService } = require('../dist/providers/messaging/meta-whatsapp/meta-whatsapp-webhook.service');
const { MessageType } = require('../dist/providers/messaging/models/message.enums');
const {
  ProviderAuthenticationError,
  ProviderRateLimitError,
  ProviderUnavailableError,
} = require('../dist/providers/provider-error');
const {
  verifyMetaWebhookSignature,
} = require('../dist/providers/messaging/meta-whatsapp/utils/webhook-signature.util');

const config = {
  accessToken: 'verification-access-token',
  phoneNumberId: '1234567890',
  businessAccountId: '9876543210',
  verifyToken: 'verification-token',
  appSecret: 'verification-app-secret',
  graphApiVersion: 'v26.0',
  baseUrl: 'https://graph.example',
  httpTimeoutMs: 1000,
  allowedSender: '+91 99999-99999',
  templateLanguage: 'en_US',
  maxRetries: 0,
  retryBaseDelayMs: 1,
  dedupTtlSeconds: 604800,
};

function sendResponse(id = 'wamid.verification') {
  return new Response(JSON.stringify({
    messaging_product: 'whatsapp',
    contacts: [{ input: '919999999999', wa_id: '919999999999' }],
    messages: [{ id }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

class FakeRedisClient {
  constructor() { this.keys = new Set(); }
  async set(key) {
    if (this.keys.has(key)) return null;
    this.keys.add(key);
    return 'OK';
  }
  async del(key) { this.keys.delete(key); return 1; }
}

async function main() {
  const originalFetch = global.fetch;
  try {
    const requests = [];
    global.fetch = async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return sendResponse(`wamid.${requests.length}`);
    };
    const provider = new MetaWhatsAppProvider(new MetaWhatsAppClient(config), config);
    const textResult = await provider.sendMessage({
      recipient: '+91 99999 99999', messageType: MessageType.TEXT, text: 'Test message',
    });
    const templateResult = await provider.sendMessage({
      recipient: '919999999999',
      messageType: MessageType.TEMPLATE,
      templateId: 'trade_candidate_alert',
      templateVariables: { symbol: 'RELIANCE', score: 88 },
    });
    assert.equal(requests[0].url, 'https://graph.example/v26.0/1234567890/messages');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer verification-access-token');
    assert.equal(requests[0].body.type, 'text');
    assert.deepEqual(requests[0].body.text, { preview_url: false, body: 'Test message' });
    assert.equal(requests[1].body.type, 'template');
    assert.equal(requests[1].body.template.name, 'trade_candidate_alert');
    assert.equal(requests[1].body.template.language.code, 'en_US');
    assert.deepEqual(requests[1].body.template.components[0].parameters, [
      { type: 'text', text: 'RELIANCE' }, { type: 'text', text: '88' },
    ]);
    assert.equal(textResult.status, 'ACCEPTED');
    assert.equal(textResult.sentAt, null);
    assert.equal(templateResult.providerMessageId, 'wamid.2');

    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
    const signature = `sha256=${createHmac('sha256', config.appSecret).update(rawBody).digest('hex')}`;
    assert.equal(verifyMetaWebhookSignature(rawBody, signature, config.appSecret), true);
    assert.equal(verifyMetaWebhookSignature(rawBody, 'sha256=' + '0'.repeat(64), config.appSecret), false);

    const handled = [];
    const redisClient = new FakeRedisClient();
    const webhook = new MetaWhatsAppWebhookService(
      config,
      { getClient: () => redisClient },
      { handle: async message => handled.push(message) },
    );
    assert.equal(webhook.verifyChallenge('subscribe', config.verifyToken, 'challenge-value'), 'challenge-value');
    assert.throws(() => webhook.verifyChallenge('subscribe', 'wrong', 'challenge-value'));
    webhook.validateSignature(rawBody, signature);
    assert.throws(() => webhook.validateSignature(rawBody, 'sha256=' + '0'.repeat(64)));

    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: {
        metadata: { display_phone_number: '15550001111', phone_number_id: '1234567890' },
        contacts: [{ profile: { name: 'Owner' }, wa_id: '919999999999' }],
        messages: [
          { from: '919999999999', id: 'wamid.inbound', timestamp: '1789305300', type: 'text', text: { body: 'BUY 2920 20' } },
          { from: '919999999999', id: 'wamid.image', timestamp: '1789305300', type: 'image', image: {} },
          { from: '918888888888', id: 'wamid.unauthorized', timestamp: '1789305300', type: 'text', text: { body: 'BUY 1 1' } },
        ],
        statuses: [{ id: 'wamid.outbound', status: 'delivered', timestamp: '1789305301', recipient_id: '919999999999' }],
      } }] }],
    };
    const first = await webhook.process(payload);
    const replay = await webhook.process(payload);
    assert.equal(first.textMessagesAccepted, 1);
    assert.equal(first.unauthorizedIgnored, 1);
    assert.equal(first.unsupportedIgnored, 1);
    assert.equal(first.statusesObserved, 1);
    assert.equal(replay.duplicatesIgnored, 1);
    assert.equal(handled.length, 1);
    assert.deepEqual(handled[0], {
      sender: '919999999999',
      text: 'BUY 2920 20',
      providerMessageId: 'wamid.inbound',
      receivedAt: '2026-09-13T13:15:00.000Z',
      metadata: {
        provider: 'meta-whatsapp', messageType: 'text', phoneNumberId: '1234567890',
        displayPhoneNumber: '15550001111', contactName: 'Owner',
      },
    });

    for (const [status, code, ErrorType] of [
      [401, 190, ProviderAuthenticationError],
      [429, 4, ProviderRateLimitError],
      [503, undefined, ProviderUnavailableError],
    ]) {
      global.fetch = async () => new Response(JSON.stringify({ error: { code } }), { status });
      await assert.rejects(
        new MetaWhatsAppClient(config).send(requests[0].body),
        ErrorType,
      );
    }

    let retryCalls = 0;
    global.fetch = async () => {
      retryCalls += 1;
      return retryCalls === 1
        ? new Response(JSON.stringify({ error: { code: 2 } }), { status: 503 })
        : sendResponse();
    };
    await new MetaWhatsAppClient({ ...config, maxRetries: 1 }).send(requests[0].body);
    assert.equal(retryCalls, 2);
    console.log('Meta WhatsApp provider verification passed.');
  } finally {
    global.fetch = originalFetch;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
