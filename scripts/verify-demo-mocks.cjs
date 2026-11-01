const assert = require('node:assert/strict');
require('reflect-metadata');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const { DEMO_OPERATIONS, createDemoDocument } = require('../dist/swagger/demo-document');
const { DEMO_MOCK_IDS, DEMO_MOCK_RESPONSES } = require('../dist/swagger/demo-mock.fixtures');
const { DemoMockInterceptor } = require('../dist/swagger/demo-mock.interceptor');

const controllers = [
  require('../dist/health/health.controller').HealthController,
  require('../dist/trading-profile/trading-profile.controller').TradingProfileController,
  require('../dist/market-data/market-data.controller').MarketDataController,
  require('../dist/scanner/scanner.controller').ScannerController,
  require('../dist/candidates/candidates.controller').CandidatesController,
  require('../dist/trades/trades.controller').TradesController,
];
let handlerCalls = 0;
const dependencies = new Set(
  controllers.flatMap((controller) => Reflect.getMetadata('design:paramtypes', controller) || []),
);
class MockVerificationModule {}
Module({
  controllers,
  providers: [...dependencies].map((provide) => ({
    provide,
    useValue: new Proxy(
      {},
      {
        get: (_target, name) =>
          name === 'listRuns'
            ? () => {
                handlerCalls++;
                return { live: true };
              }
            : undefined,
      },
    ),
  })),
})(MockVerificationModule);

async function main() {
  const app = await NestFactory.create(MockVerificationModule, { logger: false });
  try {
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new DemoMockInterceptor());
    const full = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Full').build());
    const original = JSON.stringify(full);
    const demo = createDemoDocument(full, true);
    assert.match(demo.info.title, /MOCK RESPONSES/);
    assert.equal(JSON.stringify(full), original);
    assert.equal(Object.keys(DEMO_MOCK_RESPONSES).length, DEMO_OPERATIONS.length);
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    for (const [method, path] of DEMO_OPERATIONS) {
      const key = `${method.toUpperCase()} ${path}`;
      assert.ok(Object.hasOwn(DEMO_MOCK_RESPONSES, key), `Missing fixture: ${key}`);
      assert.match(demo.paths[path][method].description, /MOCK RESPONSE MODE/);
      // Arbitrary valid IDs and query filters must still produce the exact fixed response.
      const url = path.replace(/\{[^}]+\}/g, DEMO_MOCK_IDS.candidate);
      for (let repeat = 0; repeat < 2; repeat++) {
        const response = await fetch(`${base}${url}?shortlisted=false`, {
          method: method.toUpperCase(),
          ...(method === 'post'
            ? {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  actualEntry: '999.0000',
                  quantity: repeat + 1,
                  reason: 'Demo',
                }),
              }
            : {}),
        });
        assert.equal(response.status, 200, key);
        assert.equal(response.headers.get('x-demo-mock'), 'true', key);
        assert.match(response.headers.get('x-demo-notice'), /no operation performed/);
        assert.deepEqual(await response.json(), DEMO_MOCK_RESPONSES[key], key);
      }
    }
    assert.equal(handlerCalls, 0, 'Mock routes must bypass business services');
    const live = await fetch(`${base}/api/scanner/runs`);
    assert.equal(live.headers.get('x-demo-mock'), null);
    assert.deepEqual(await live.json(), { live: true });
    assert.equal(handlerCalls, 1, 'Non-demo route must reach its real handler');
    const wrongMethod = await fetch(`${base}/api/scanner/run`);
    assert.equal(wrongMethod.status, 404);
    assert.equal(wrongMethod.headers.get('x-demo-mock'), null);

    // Without registering the interceptor, the same route reaches its business service.
    const normal = await NestFactory.create(MockVerificationModule, { logger: false });
    try {
      normal.setGlobalPrefix('api');
      await normal.listen(0, '127.0.0.1');
      const response = await fetch(`${await normal.getUrl()}/api/scanner/runs`);
      assert.deepEqual(await response.json(), { live: true });
      assert.equal(response.headers.get('x-demo-mock'), null);
    } finally {
      await normal.close();
    }
    console.log(
      'PASS: all 16 mock endpoints over HTTP, repeatable bodies, disclosure headers, no service calls, non-demo and normal routes preserved.',
    );
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
