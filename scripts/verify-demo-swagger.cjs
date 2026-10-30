const assert = require('node:assert/strict');
require('reflect-metadata');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const { createDemoDocument } = require('../dist/swagger/demo-document');
const { loadDemoSnapshots } = require('../dist/swagger/demo-snapshots');

// Generate the real controller documentation without databases, queues, or provider calls.
const controllers = [
  require('../dist/health/health.controller').HealthController,
  require('../dist/trading-profile/trading-profile.controller').TradingProfileController,
  require('../dist/market-data/market-data.controller').MarketDataController,
  require('../dist/scanner/scanner.controller').ScannerController,
  require('../dist/candidates/candidates.controller').CandidatesController,
  require('../dist/trades/trades.controller').TradesController,
];
const dependencies = new Set(
  controllers.flatMap((controller) => Reflect.getMetadata('design:paramtypes', controller) || []),
);
class DocumentationModule {}
Module({
  controllers,
  providers: [...dependencies].map((provide) => ({ provide, useValue: {} })),
})(DocumentationModule);

async function main() {
  const app = await NestFactory.create(DocumentationModule, { logger: false });
  try {
    app.setGlobalPrefix('api');
    const full = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Full').build());
    const original = JSON.stringify(full);
    const demo = createDemoDocument(full);
    const operations = Object.entries(demo.paths).flatMap(([path, methods]) =>
      Object.entries(methods)
        .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
        .map(([method, operation]) => ({ path, method, operation })),
    );
    assert.equal(operations.length, 16);
    assert.deepEqual(
      operations.map(({ operation }) => operation.tags[0]),
      demo.tags.map(({ name }) => name),
    );
    assert.deepEqual(
      demo.tags.map(({ name }) => name),
      [...demo.tags.map(({ name }) => name)].sort(),
    );
    assert.equal(operations[0].path, '/api/health');
    assert.equal(operations.at(-1).path, '/api/trades/{id}/events');
    assert.ok(full.paths['/api/settings/trading-profile'].put);
    assert.equal(demo.paths['/api/settings/trading-profile'].put, undefined);
    assert.equal(demo.paths['/api/candidates/{id}/ai/deep-review'], undefined);
    assert.equal(demo.paths['/api/market-data/refresh-universe'], undefined);
    assert.ok(demo.paths['/api/candidates/{id}/buy'].post.requestBody);
    assert.ok(demo.components.schemas.BuyCandidateDto);
    assert.ok(demo.paths['/api/scanner/runs/{id}/results'].get.parameters);
    assert.equal(JSON.stringify(full), original, 'Full documentation must remain unchanged');

    // Check every local schema/parameter reference in the curated document still resolves.
    function checkReferences(value) {
      if (!value || typeof value !== 'object') return;
      if (typeof value.$ref === 'string' && value.$ref.startsWith('#/')) {
        let resolved = demo;
        for (const part of value.$ref.slice(2).split('/')) {
          resolved = resolved?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
        }
        assert.ok(resolved, `Unresolved reference: ${value.$ref}`);
      }
      Object.values(value).forEach(checkReferences);
    }
    checkReferences(demo);
    const snapshot = {
      capturedAt: '2026-10-30T00:00:00.000Z',
      operations: {
        'POST /api/candidates/{id}/buy': {
          kind: 'persisted-evidence',
          source: 'GET /api/trades/saved-trade',
          request: {
            path: '/api/candidates/saved-candidate/buy',
            parameters: { id: 'saved-candidate' },
            body: { actualEntry: '100.0000', quantity: 5 },
          },
          body: { id: 'saved-trade', status: 'CANCELLED' },
        },
      },
    };
    const preview = createDemoDocument(full, snapshot);
    const buyPreview = preview.paths['/api/candidates/{id}/buy'].post;
    assert.equal(buyPreview.requestBody.content['application/json'].example.quantity, 5);
    assert.equal(buyPreview.parameters.find((p) => p.name === 'id').example, 'saved-candidate');
    assert.equal(buyPreview.responses.default.content['application/json'].example.status, 'CANCELLED');
    assert.match(buyPreview.description, /Request preview/);
    assert.doesNotMatch(buyPreview.description, /Source:|Captured:|Record timestamp:|Persisted stage evidence/);
    assert.equal(buyPreview.responses.default.description, 'Saved example');
    assert.match(preview.paths['/api/candidates/{id}/news/enrich'].post.description, /No saved evidence/);
    assert.match(preview.paths['/api/health'].get.description, /Execute this GET live/);
    assert.match(preview.paths['/api/settings/trading-profile'].get.description, /Execute this GET live/);
    assert.equal(JSON.stringify(full), original, 'Preview must not mutate full documentation');
    const localSnapshots = loadDemoSnapshots();
    if (localSnapshots) {
      const captured = createDemoDocument(full, localSnapshots);
      for (const [key, saved] of Object.entries(localSnapshots.operations)) {
        const [method, path] = key.split(' ');
        const operation = captured.paths[path][method.toLowerCase()];
        const example = operation.responses[saved.statusCode || 'default'].content['application/json'].example;
        assert.deepEqual(example, saved.body);
      }
      console.log(`PASS: ${Object.keys(localSnapshots.operations).length} local captured examples rendered.`);
    }
    console.log('PASS: ordered routes, request previews, honest evidence labels, missing-data handling, full API preserved.');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
