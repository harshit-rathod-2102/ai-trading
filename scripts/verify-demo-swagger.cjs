const assert = require('node:assert/strict');
require('reflect-metadata');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const { createDemoDocument } = require('../dist/swagger/demo-document');

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
    for (const { path, method, operation } of operations) {
      assert.deepEqual(operation.responses, full.paths[path][method].responses);
      assert.deepEqual(operation.parameters, full.paths[path][method].parameters);
      assert.deepEqual(operation.requestBody, full.paths[path][method].requestBody);
      assert.doesNotMatch(operation.description || '', /Request preview|No saved evidence/);
    }
    const mock = createDemoDocument(full, true);
    assert.match(mock.info.title, /MOCK RESPONSES/);
    for (const { path, method } of operations) {
      const operation = mock.paths[path][method];
      assert.match(operation.description, /MOCK RESPONSE MODE/);
      assert.deepEqual(operation.responses, full.paths[path][method].responses);
      assert.deepEqual(operation.parameters, full.paths[path][method].parameters);
      assert.deepEqual(operation.requestBody, full.paths[path][method].requestBody);
    }
    assert.equal(JSON.stringify(full), original, 'Documentation must not be mutated');
    console.log(
      'PASS: ordered routes, no injected request/response examples in either mode, mock labels and full API preserved.',
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
