// Runtime wiring check. Creates one temporary scanner result and removes it afterward.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');
const { Client } = require('pg');
if (existsSync('.env')) process.loadEnvFile('.env');

async function main() {
  const db = new Client({
    host: process.env.VERIFY_DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 5432),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  });
  const runId = randomUUID();
  const resultId = randomUUID();
  await db.connect();
  let inserted = false;
  try {
    const instrument = (await db.query(
      "SELECT id, symbol, exchange, sector FROM instruments WHERE type='EQUITY' ORDER BY symbol LIMIT 1",
    )).rows[0];
    assert.ok(instrument, 'Risk API verification requires one persisted equity instrument');
    const candidateCount = Number((await db.query('SELECT count(*) AS count FROM trade_candidates')).rows[0].count);
    await db.query(`INSERT INTO scan_runs
      (id, market_date, scanner_version, status, total_universe, eligible_universe,
       evaluated_symbols, qualified_setups, shortlisted_setups, started_at, completed_at)
      VALUES ($1, DATE '2000-01-04', $2, 'SUCCESS', 1, 1, 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [runId, `risk-api-verification-${runId}`]);
    inserted = true;
    const technical = { close: '820.0000', atr14: '5.0000', asOf: '2000-01-04T00:00:00.000Z' };
    const strategy = { strategy: 'MOMENTUM_BREAKOUT', strategyVersion: 'momentum-breakout-v1',
      qualified: true, score: '90.0000', qualificationThreshold: '70.0000', components: {}, reasons: [],
      rejectionCodes: [], rejectionReasons: [], warningCodes: [], warnings: [],
      setupContext: { breakoutLevel: '819.0000', recentBaseLow: '795.0000', prior50DayHigh: '800.0000' },
      inputEvidence: {}, evaluatedAt: '2000-01-04T12:00:00.000Z' };
    await db.query(`INSERT INTO scan_results
      (id, scan_run_id, instrument_id, symbol, exchange, sector, strategy, strategy_version,
       strategy_score, ranking_score, global_ranking_score, strategy_rank,
       strategy_qualified_count, global_rank, global_qualified_count,
       technical_snapshot, strategy_result, ranking_features, is_shortlisted)
      VALUES ($1,$2,$3,$4,$5,$6,'MOMENTUM_BREAKOUT','momentum-breakout-v1',
       90,88,88,1,1,1,1,$7::jsonb,$8::jsonb,'{}'::jsonb,TRUE)`,
    [resultId, runId, instrument.id, instrument.symbol, instrument.exchange, instrument.sector,
      JSON.stringify(technical), JSON.stringify(strategy)]);

    const base = process.env.VERIFY_API_URL || 'http://localhost:3000/api';
    const response = await fetch(`${base}/risk/evaluate/${resultId}`, { method: 'POST', signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.equal(body.riskVersion, 'risk-v1');
    assert.equal(body.proposedEntry, '820.0000');
    assert.equal(body.structuralStop, '795.0000');
    assert.ok(Array.isArray(body.rejectionCodes));
    assert.equal(Number((await db.query('SELECT count(*) AS count FROM trade_candidates')).rows[0].count), candidateCount,
      'Risk inspection must not create candidates');
    console.log(`PASS: Risk API loaded persisted scanner evidence and returned ${body.accepted ? 'accepted' : 'rejected'} risk-v1 plan without candidate creation.`);
  } finally {
    if (inserted) await db.query('DELETE FROM scan_runs WHERE id=$1', [runId]);
    await db.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
