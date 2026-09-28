const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

async function main() {
  const {
    PipelineJobSummaryService,
  } = require('../dist/jobs/services/pipeline-job-summary.service');

  const runs = [pipelineRun('run-1', 'scan-1')];
  const scans = [scanRun('scan-1')];
  const summaries = [];
  const runRepository = repository(runs);
  const scanRepository = repository(scans);
  const summaryRepository = repository(summaries, true);
  const dataSource = {
    transaction: async (operation) =>
      operation({
        query: async () => undefined,
        getRepository: () => summaryRepository,
      }),
  };
  const config = {
    get: (key) =>
      ({
        'metaWhatsapp.allowedSender': '919999999999',
        'providers.messaging': 'meta-whatsapp',
      })[key],
  };
  let aiCalls = 0;
  const ai = {
    summarizePipelineJob: async (input) => {
      aiCalls += 1;
      assert.deepEqual(input.indexSymbols, ['NIFTY50', 'INDIAVIX']);
      return {
        summary:
          'The market regime was bearish, and the scan produced two qualified setups from ten evaluated equities.',
        provider: 'openrouter',
        requestedModel: 'fast-model',
        resolvedModel: 'resolved-model',
        promptVersion: 'pipeline-job-summary-v1',
        requestId: 'ai-request-1',
      };
    },
  };
  const messages = [];
  const messaging = {
    sendMessage: async (message) => {
      messages.push(message);
      return { providerMessageId: 'message-1', status: 'ACCEPTED', sentAt: null };
    },
  };
  const service = new PipelineJobSummaryService(
    dataSource,
    config,
    messaging,
    ai,
    runRepository,
    scanRepository,
    summaryRepository,
  );

  const firstDispatch = dispatch('post-market-2026-09-21', 'MANUAL');
  const first = await service.sendForRun('run-1', firstDispatch);
  assert.equal(first.status, 'SENT');
  assert.equal(first.reused, false);
  assert.equal(messages.length, 1);
  assert.equal(aiCalls, 1);
  for (const expected of [
    'Trigger: MANUAL',
    'Regime: BEARISH',
    'Regime score: -51.8519',
    'Indices scanned: NIFTY50, INDIAVIX',
    'Universe equities: 12',
    'Eligible equities: 10',
    'Evaluated equities: 10',
    'Qualified setups: 2',
    'Shortlisted candidates: 1',
    'AI summary:',
  ]) {
    assert.ok(messages[0].text.includes(expected), `message is missing ${expected}`);
  }

  const reused = await service.sendForRun('run-1', firstDispatch);
  assert.equal(reused.reused, true);
  assert.equal(messages.length, 1, 'a sent summary must not be delivered twice');
  assert.equal(aiCalls, 1, 'a sent summary must not regenerate AI text');

  const laterDispatch = dispatch('run-now-2026-09-21-1', 'MANUAL', '2026-09-21T12:00:00.000Z');
  const later = await service.sendForRun('run-1', laterDispatch);
  assert.equal(later.reused, false);
  assert.equal(messages.length, 2, 'a later dispatcher job must receive its own summary');
  assert.equal(aiCalls, 2);
  assert.ok(messages[1].text.includes('Job time: 21 Sept 2026, 5:30 pm IST'));

  runs.push(pipelineRun('run-2', 'scan-2'));
  scans.push(scanRun('scan-2'));
  const fallbackService = new PipelineJobSummaryService(
    dataSource,
    config,
    messaging,
    {
      summarizePipelineJob: async () => {
        throw new Error('AI unavailable');
      },
    },
    runRepository,
    scanRepository,
    summaryRepository,
  );
  const fallback = await fallbackService.sendForRun('run-2', dispatch('post-market-2026-09-22'));
  assert.equal(fallback.status, 'SENT');
  assert.ok(messages[2].text.includes('AI summary (fallback):'));
  assert.equal(summaries[2].summarySnapshot.aiGenerated, false);
  assert.equal(summaries[2].summarySnapshot.aiWarning, 'AI unavailable');

  let regenerated = 0;
  const retryService = new PipelineJobSummaryService(
    dataSource,
    config,
    messaging,
    {
      summarizePipelineJob: async () => {
        regenerated += 1;
        return {
          summary: 'The retry generated a bounded factual AI summary.',
          provider: 'openrouter',
          requestedModel: 'fast-model',
          resolvedModel: 'resolved-model',
          promptVersion: 'pipeline-job-summary-v1',
        };
      },
    },
    runRepository,
    scanRepository,
    summaryRepository,
  );
  summaries[2].status = 'FAILED';
  const retried = await retryService.sendForRun('run-2', dispatch('post-market-2026-09-22'));
  assert.equal(retried.status, 'SENT');
  assert.equal(regenerated, 1);
  assert.equal(messages.length, 4);
  assert.ok(messages[3].text.includes('AI summary:'));
  assert.ok(!messages[3].text.includes('AI summary (fallback):'));
  assert.equal(summaries[2].summarySnapshot.aiGenerated, true);

  const migration = readFileSync(
    'database/migrations/V17__create_pipeline_job_summaries.sql',
    'utf8',
  );
  assert.match(migration, /UNIQUE \(pipeline_run_id\)/);
  assert.match(migration, /REFERENCES daily_pipeline_runs\(id\)/);
  const dispatchMigration = readFileSync(
    'database/migrations/V18__scope_pipeline_job_summaries_to_job_dispatch.sql',
    'utf8',
  );
  assert.match(dispatchMigration, /ADD COLUMN job_id VARCHAR\(255\)/);
  assert.match(dispatchMigration, /UNIQUE \(pipeline_run_id, job_id\)/);
  console.log(
    'PASS: pipeline job summaries include scan facts, retry safely, and send once per job dispatch.',
  );
}

function dispatch(jobId, triggerSource = 'SCHEDULED', requestedAt = '2026-09-21T05:15:00.000Z') {
  return { jobId, triggerSource, requestedAt };
}

function pipelineRun(id, scannerRunId) {
  return {
    id,
    scannerRunId,
    marketDate: '2026-09-21',
    version: 'daily-pipeline-v1',
    status: 'SUCCESS',
    triggerSource: 'MANUAL',
    startedAt: new Date('2026-09-21T05:15:00.000Z'),
    completedAt: new Date('2026-09-21T05:20:00.000Z'),
    metadata: { marketData: { requiredBenchmarks: ['NIFTY50', 'INDIAVIX'] } },
  };
}

function scanRun(id) {
  return {
    id,
    totalUniverse: 12,
    eligibleUniverse: 10,
    evaluatedSymbols: 10,
    qualifiedSetups: 2,
    shortlistedSetups: 1,
    marketRegimeSnapshot: { regime: 'BEARISH', score: '-51.8519' },
  };
}

function repository(rows, timestamps = false) {
  return {
    findOneBy: async (where) => rows.find((row) => matches(row, where)) || null,
    findOneByOrFail: async (where) => {
      const row = rows.find((candidate) => matches(candidate, where));
      if (!row) throw new Error('row not found');
      return row;
    },
    create: (value) => ({ ...value }),
    save: async (value) => {
      if (timestamps) value.updatedAt = new Date();
      const index = rows.findIndex((row) => row.id === value.id);
      if (index >= 0) rows[index] = value;
      else rows.push(value);
      return value;
    },
  };
}

function matches(row, where) {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
