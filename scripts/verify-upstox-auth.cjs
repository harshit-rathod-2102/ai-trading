const assert = require('node:assert/strict');

async function main() {
  const { plainToInstance } = require('class-transformer');
  const { validate } = require('class-validator');
  const {
    UpstoxAccessTokenWebhookDto,
  } = require('../dist/providers/upstox/auth/dto/upstox-access-token-webhook.dto');
  const { UpstoxAuthService } = require('../dist/providers/upstox/auth/upstox-auth.service');
  const { UpstoxTokenService } = require('../dist/providers/upstox/auth/upstox-token.service');
  const {
    UpstoxAuthenticationFailedError,
  } = require('../dist/providers/upstox/auth/upstox-auth.errors');
  const { UpstoxClient } = require('../dist/providers/market-data/upstox/upstox-client');
  const { DailyPipelineService } = require('../dist/jobs/services/daily-pipeline.service');
  const { MarketDataWorker } = require('../dist/market-data/market-data.jobs');

  const originalFetch = global.fetch;
  try {
    await verifyWebhookTimestampNormalization(
      plainToInstance,
      validate,
      UpstoxAccessTokenWebhookDto,
    );
    await verifyTokenRequest(UpstoxAuthService);
    await verifyFallbackInvalidation(UpstoxTokenService);
    await verifyAdapterResolutionAnd401(UpstoxClient, UpstoxAuthenticationFailedError);
    await verifySchedulerGuards(DailyPipelineService, MarketDataWorker);
  } finally {
    global.fetch = originalFetch;
  }
  console.log(
    'PASS: Upstox webhook normalization, request de-duplication, call-time token resolution, 401 invalidation, and scheduler auth guards.',
  );
}

async function verifyWebhookTimestampNormalization(plainToInstance, validate, WebhookDto) {
  const dto = plainToInstance(WebhookDto, {
    client_id: '615b1297-d443-3b39-ba19-1927fbcdddc7',
    user_id: 'AB1234',
    access_token: 'runtime-token',
    token_type: 'Bearer',
    expires_at: 1787247000000,
    issued_at: 1787203800000,
    message_type: 'access_token',
  });

  assert.equal(dto.expires_at, '1787247000000');
  assert.equal(dto.issued_at, '1787203800000');
  assert.deepEqual(await validate(dto), []);
}

async function verifyFallbackInvalidation(UpstoxTokenService) {
  const repository = { findOneBy: async () => null };
  const manager = {
    query: async () => undefined,
    getRepository: () => repository,
  };
  const service = new UpstoxTokenService(
    { transaction: (work) => work(manager) },
    repository,
    {
      get: (key) => (key === 'upstox.accessToken' ? 'environment-fallback' : null),
    },
    { configured: () => false },
  );
  assert.equal(await service.getValidAccessToken(), 'environment-fallback');
  await service.invalidateCurrentToken('HTTP_401');
  await assert.rejects(service.getValidAccessToken(), (error) => {
    assert.equal(error.operationalCode, 'UPSTOX_ACCESS_TOKEN_UNAVAILABLE');
    return true;
  });
}

async function verifyTokenRequest(UpstoxAuthService) {
  const expiry = Date.now() + 60 * 60 * 1000;
  let beginCount = 0;
  let providerCalls = 0;
  let pendingUpdate;
  const tokens = {
    async beginTokenRequest() {
      beginCount += 1;
      return beginCount === 1
        ? {
            started: true,
            status: 'PENDING_APPROVAL',
            requestedAt: new Date('2026-09-20T09:00:00.000Z'),
            requestExpiresAt: null,
          }
        : {
            started: false,
            status: 'PENDING_APPROVAL',
            requestedAt: new Date('2026-09-20T09:00:00.000Z'),
            requestExpiresAt: new Date(expiry),
          };
    },
    async markRequestPending(requestedAt, requestExpiresAt) {
      pendingUpdate = { requestedAt, requestExpiresAt };
    },
    async markRequestFailed() {
      assert.fail('Successful token request must not be marked failed');
    },
  };
  global.fetch = async (url, options) => {
    providerCalls += 1;
    assert.equal(url, 'https://api.upstox.test/v3/login/auth/token/request/test-client');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { client_secret: 'test-secret' });
    assert.equal(options.headers.Authorization, undefined);
    return new Response(
      JSON.stringify({
        status: 'success',
        data: { authorization_expiry: String(expiry), notifier_url: 'https://example.test/hook' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };
  const service = new UpstoxAuthService(
    {
      clientId: 'test-client',
      clientSecret: 'test-secret',
      accessToken: null,
      apiBaseUrl: 'https://api.upstox.test',
      instrumentFileUrl: 'https://assets.upstox.test/instruments.json.gz',
      httpTimeoutMs: 1000,
      maxRetries: 0,
      retryBaseDelayMs: 100,
    },
    tokens,
  );
  const started = await service.requestAccessToken();
  assert.equal(started.status, 'PENDING_APPROVAL');
  assert.equal(started.reused, false);
  assert.equal(pendingUpdate.requestExpiresAt.getTime(), expiry);
  const duplicate = await service.requestAccessToken();
  assert.equal(duplicate.status, 'PENDING_APPROVAL');
  assert.equal(duplicate.reused, true);
  assert.equal(providerCalls, 1);
}

async function verifyAdapterResolutionAnd401(UpstoxClient, UpstoxAuthenticationFailedError) {
  let tokenReads = 0;
  let invalidations = 0;
  const authorizationValues = [];
  const tokens = {
    async getValidAccessToken() {
      tokenReads += 1;
      return `runtime-token-${tokenReads}`;
    },
    async invalidateCurrentToken(reason) {
      invalidations += 1;
      assert.equal(reason, 'HTTP_401');
    },
  };
  let responseCount = 0;
  global.fetch = async (_url, options) => {
    authorizationValues.push(options.headers.Authorization);
    responseCount += 1;
    return responseCount < 3
      ? new Response(JSON.stringify({ status: 'success' }), { status: 200 })
      : new Response('{}', { status: 401 });
  };
  const client = new UpstoxClient(
    {
      clientId: null,
      clientSecret: null,
      accessToken: null,
      apiBaseUrl: 'https://api.upstox.test',
      instrumentFileUrl: 'https://assets.upstox.test/instruments.json.gz',
      httpTimeoutMs: 1000,
      maxRetries: 0,
      retryBaseDelayMs: 100,
    },
    tokens,
  );
  await client.getJson('/first');
  await client.getJson('/second');
  assert.deepEqual(authorizationValues.slice(0, 2), [
    'Bearer runtime-token-1',
    'Bearer runtime-token-2',
  ]);
  await assert.rejects(client.getJson('/unauthorized'), (error) => {
    assert.ok(error instanceof UpstoxAuthenticationFailedError);
    assert.equal(error.operationalCode, 'UPSTOX_AUTHENTICATION_FAILED');
    return true;
  });
  assert.equal(tokenReads, 3);
  assert.equal(invalidations, 1);
}

async function verifySchedulerGuards(DailyPipelineService, MarketDataWorker) {
  const config = { getOrThrow: (key) => (key === 'providers.marketData' ? 'upstox' : undefined) };
  const tokens = { getStatus: async () => ({ authenticated: false }) };
  const shouldNotRun = new Proxy(
    {},
    {
      get() {
        return () => assert.fail('Provider-dependent work ran without Upstox authentication');
      },
    },
  );
  const pipeline = new DailyPipelineService(
    shouldNotRun,
    shouldNotRun,
    config,
    shouldNotRun,
    shouldNotRun,
    tokens,
    shouldNotRun,
    shouldNotRun,
    shouldNotRun,
    shouldNotRun,
  );
  const pipelineResult = await pipeline.run({
    marketDate: '2026-09-21',
    triggerSource: 'MANUAL',
  });
  assert.equal(pipelineResult.status, 'UPSTOX_AUTH_REQUIRED');

  const worker = new MarketDataWorker(shouldNotRun, config, tokens);
  const workerResult = await worker.process({
    id: 'verify',
    name: 'refresh-daily',
    attemptsMade: 0,
    opts: { attempts: 1 },
    data: { instrumentId: 'verify-instrument', from: '2026-09-01', to: '2026-09-02' },
  });
  assert.equal(workerResult.status, 'UPSTOX_AUTH_REQUIRED');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
