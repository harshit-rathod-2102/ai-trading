const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');

if (existsSync('.env')) process.loadEnvFile('.env');
process.env.DATABASE_HOST = 'localhost';
process.env.REDIS_HOST = 'localhost';
process.env.SCHEDULER_ENABLED = process.argv[2] === 'enabled' ? 'true' : 'false';

async function openAndInspect() {
  const { NestFactory } = require('@nestjs/core');
  const { getQueueToken } = require('@nestjs/bullmq');
  const { AppModule } = require('../dist/app.module');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const queues = ['market-monitoring', 'post-market', 'evening'];
    const result = {};
    for (const name of queues) {
      const queue = app.get(getQueueToken(name));
      result[name] = await queue.getJobSchedulers();
    }
    return result;
  } finally { await app.close(); }
}

async function main() {
  const first = await openAndInspect();
  const second = await openAndInspect();
  const expected = process.env.SCHEDULER_ENABLED === 'true' ? 1 : 0;
  for (const queue of ['market-monitoring', 'post-market', 'evening']) {
    assert.equal(first[queue].length, expected, `${queue} first startup`);
    assert.equal(second[queue].length, expected, `${queue} restart`);
  }
  console.log(`PASS: scheduler ${process.argv[2]} state is restart-safe (${expected} registration per queue).`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
