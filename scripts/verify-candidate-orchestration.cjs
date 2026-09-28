// End-to-end verification for scanner-result candidate orchestration.
// Creates isolated fixtures, restores the active profile, and removes all fixtures afterward.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');
const { Client } = require('pg');

if (existsSync('.env')) process.loadEnvFile('.env');

const apiBase = process.env.VERIFY_API_URL || 'http://localhost:3000/api';
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

function shiftDate(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function evidence(marketDate, options = {}) {
  const stop = options.stop || '795.0000';
  const qualified = options.qualified !== false;
  return {
    technical: { close: '820.0000', atr14: '10.0000', asOf: `${marketDate}T10:00:00.000Z` },
    strategy: {
      strategy: 'MOMENTUM_BREAKOUT', strategyVersion: 'momentum-breakout-v1', qualified,
      score: qualified ? '90.0000' : '40.0000', qualificationThreshold: '70.0000',
      components: { trend: { score: '90.0000', weightPercent: '25.0000', contribution: '22.5000', evidence: {} } },
      reasons: qualified ? ['Fixture qualifies'] : [],
      rejectionCodes: qualified ? [] : ['SETUP_SCORE_TOO_LOW'],
      rejectionReasons: qualified ? [] : ['Fixture is deliberately unqualified'],
      warningCodes: [], warnings: [],
      setupContext: { breakoutLevel: '819.0000', recentBaseLow: stop, prior50DayHigh: '900.0000' },
      inputEvidence: { close: '820.0000' }, evaluatedAt: `${marketDate}T10:01:00.000Z`,
    },
    ranking: options.missingRanking ? {} : {
      relativeStrength: { raw: '12.0000', percentile: '90.0000' },
      liquidity: { raw: '100000000.0000', percentile: '85.0000' },
    },
  };
}

async function api(path, method = 'POST') {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: { 'x-request-id': `verify-candidate-${randomUUID()}` },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body };
}

async function main() {
  const db = new Client({
    host: process.env.VERIFY_DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 5432),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  });
  const runIds = [];
  let profile;
  let instrument;
  let triggerName;
  let functionName;
  await db.connect();

  async function fixture(label, options = {}) {
    const runId = randomUUID();
    const resultId = randomUUID();
    const marketDate = options.marketDate || today;
    const values = evidence(marketDate, options);
    const regime = {
      regime: 'BULLISH', score: '75.0000', confidence: 'HIGH', version: 'market-regime-v1',
      marketDate, calculatedAt: `${marketDate}T09:30:00.000Z`,
      components: { trend: { score: '80.0000', evidence: { closeAboveSma200: true } } },
      reasons: ['Fixture bullish regime'], warnings: [],
    };
    runIds.push(runId);
    await db.query(`INSERT INTO scan_runs
      (id, market_date, scanner_version, status, market_regime_snapshot, total_universe,
       eligible_universe, evaluated_symbols, qualified_setups, shortlisted_setups,
       started_at, completed_at)
      VALUES ($1,$2,$3,'SUCCESS',$4::jsonb,1,1,1,1,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    [runId, marketDate, `cv-${label.slice(0, 16)}-${runId.slice(0, 8)}`, JSON.stringify(regime),
      options.shortlisted === false ? 0 : 1]);
    await db.query(`INSERT INTO scan_results
      (id, scan_run_id, instrument_id, symbol, exchange, sector, strategy, strategy_version,
       strategy_score, ranking_score, global_ranking_score, strategy_rank,
       strategy_qualified_count, global_rank, global_qualified_count,
       technical_snapshot, strategy_result, ranking_features, is_shortlisted)
      VALUES ($1,$2,$3,$4,$5,$6,'MOMENTUM_BREAKOUT','momentum-breakout-v1',
       $7,88,87,1,2,1,4,$8::jsonb,$9::jsonb,$10::jsonb,$11)`,
    [resultId, runId, instrument.id, instrument.symbol, instrument.exchange, instrument.sector,
      options.qualified === false ? 40 : 90, JSON.stringify(values.technical),
      JSON.stringify(values.strategy), JSON.stringify(values.ranking), options.shortlisted !== false]);
    return { runId, resultId, marketDate, ...values };
  }

  try {
    const instrumentResult = await db.query(
      "SELECT id, symbol, exchange, sector FROM instruments WHERE type='EQUITY' AND is_active=TRUE ORDER BY symbol LIMIT 1",
    );
    assert.ok(instrumentResult.rows[0], 'Verification requires one active persisted equity instrument');
    instrument = instrumentResult.rows[0];

    const profileResult = await db.query('SELECT * FROM trading_profiles WHERE is_active=TRUE');
    assert.equal(profileResult.rowCount, 1, 'Verification requires exactly one active trading profile');
    profile = profileResult.rows[0];
    await db.query(`UPDATE trading_profiles SET
      account_capital=99999999999999, risk_per_trade_percent=1,
      max_position_percent=100, max_open_portfolio_risk_percent=100,
      max_open_trades=2147483647, max_sector_exposure_percent=100,
      minimum_risk_reward_ratio=0.1, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [profile.id]);

    // A: accepted risk creates a complete NEW candidate and journal event.
    const accepted = await fixture('accepted');
    const first = await api(`/candidates/from-scan-result/${accepted.resultId}`);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.outcome, 'CREATED');
    assert.equal(first.body.created, true);
    assert.equal(first.body.riskAccepted, true);
    assert.equal(first.body.candidate.status, 'NEW');
    assert.equal(first.body.candidate.scanRunId, accepted.runId);
    assert.equal(first.body.candidate.scanResultId, accepted.resultId);
    assert.equal(first.body.candidate.marketDate, accepted.marketDate);
    assert.equal(first.body.candidate.proposedEntry, '820.0000');
    assert.equal(first.body.candidate.proposedStop, '795.0000');
    assert.ok(first.body.candidate.target1 && first.body.candidate.target2);
    assert.ok(first.body.candidate.suggestedQuantity > 0);
    assert.deepEqual(first.body.candidate.technicalSnapshot, accepted.technical);
    assert.equal(first.body.candidate.marketRegimeSnapshot.marketDate, accepted.marketDate);
    assert.deepEqual(first.body.candidate.strategySnapshot, accepted.strategy);
    assert.deepEqual(first.body.candidate.rankingSnapshot.rankingFeatures, accepted.ranking);
    assert.equal(first.body.candidate.riskSnapshot.riskVersion, 'risk-v1');
    assert.equal(first.body.candidate.riskSnapshot.snapshot.tradingProfileId, profile.id);
    assert.ok(first.body.candidate.riskSnapshot.evaluatedAt);
    assert.equal(first.body.candidate.aiAnalysis, null);
    const detail = await api(`/candidates/${first.body.candidateId}`, 'GET');
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.deepEqual(detail.body.technicalSnapshot, accepted.technical);
    assert.equal(detail.body.riskSnapshot.riskVersion, 'risk-v1');
    const listed = await api(`/candidates?scanRunId=${accepted.runId}&strategy=MOMENTUM_BREAKOUT`, 'GET');
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.deepEqual(listed.body.map(candidate => candidate.id), [first.body.candidateId]);
    const event = await db.query(`SELECT event_type, source, data FROM trade_events
      WHERE candidate_id=$1 AND event_type='CANDIDATE_CREATED'`, [first.body.candidateId]);
    assert.equal(event.rowCount, 1);
    assert.equal(event.rows[0].source, 'SYSTEM');
    assert.equal(event.rows[0].data.scanResultId, accepted.resultId);
    assert.equal(event.rows[0].data.riskVersion, 'risk-v1');

    // B: repeat calls are idempotent.
    const duplicate = await api(`/candidates/from-scan-result/${accepted.resultId}`);
    assert.equal(duplicate.status, 200, JSON.stringify(duplicate.body));
    assert.equal(duplicate.body.outcome, 'ALREADY_EXISTS');
    assert.equal(duplicate.body.candidateId, first.body.candidateId);
    const acceptedCount = await db.query('SELECT count(*)::int AS count FROM trade_candidates WHERE scan_result_id=$1',
      [accepted.resultId]);
    assert.equal(acceptedCount.rows[0].count, 1);

    // C: deterministic risk rejection leaves the scanner result and creates no candidate.
    const rejected = await fixture('risk-rejected', { stop: '700.0000' });
    const rejection = await api(`/candidates/from-scan-result/${rejected.resultId}`);
    assert.equal(rejection.status, 200, JSON.stringify(rejection.body));
    assert.equal(rejection.body.outcome, 'RISK_REJECTED');
    assert.equal(rejection.body.created, false);
    assert.equal(rejection.body.riskAccepted, false);
    assert.ok(rejection.body.riskRejectionCodes.includes('STOP_TOO_WIDE'));
    assert.equal((await db.query('SELECT count(*)::int AS count FROM trade_candidates WHERE scan_result_id=$1',
      [rejected.resultId])).rows[0].count, 0);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM scan_results WHERE id=$1',
      [rejected.resultId])).rows[0].count, 1);

    // D-G: invalid setup state, eligibility, evidence, and age fail with stable domain codes.
    const unqualified = await fixture('unqualified', { qualified: false });
    const unqualifiedResponse = await api(`/candidates/from-scan-result/${unqualified.resultId}`);
    assert.equal(unqualifiedResponse.status, 422, JSON.stringify(unqualifiedResponse.body));
    assert.equal(unqualifiedResponse.body.code, 'SETUP_NOT_QUALIFIED');

    const notShortlisted = await fixture('not-shortlisted', { shortlisted: false });
    const shortlistResponse = await api(`/candidates/from-scan-result/${notShortlisted.resultId}`);
    assert.equal(shortlistResponse.status, 422, JSON.stringify(shortlistResponse.body));
    assert.equal(shortlistResponse.body.code, 'SETUP_NOT_SHORTLISTED');

    const missing = await fixture('missing-evidence', { missingRanking: true });
    const missingResponse = await api(`/candidates/from-scan-result/${missing.resultId}`);
    assert.equal(missingResponse.status, 422, JSON.stringify(missingResponse.body));
    assert.equal(missingResponse.body.code, 'MISSING_SCAN_EVIDENCE');

    const stale = await fixture('stale', { marketDate: shiftDate(today, -10) });
    const staleResponse = await api(`/candidates/from-scan-result/${stale.resultId}`);
    assert.equal(staleResponse.status, 422, JSON.stringify(staleResponse.body));
    assert.equal(staleResponse.body.code, 'STALE_SCAN_RESULT');

    // H: near-simultaneous calls converge on one candidate through DB uniqueness.
    const concurrent = await fixture('concurrent');
    const pair = await Promise.all([
      api(`/candidates/from-scan-result/${concurrent.resultId}`),
      api(`/candidates/from-scan-result/${concurrent.resultId}`),
    ]);
    assert.deepEqual(pair.map(value => value.status), [200, 200]);
    assert.deepEqual(pair.map(value => value.body.outcome).sort(), ['ALREADY_EXISTS', 'CREATED']);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM trade_candidates WHERE scan_result_id=$1',
      [concurrent.resultId])).rows[0].count, 1);

    // I: a targeted journal trigger forces event insertion to fail; the candidate must roll back.
    const transactionFailure = await fixture('transaction-failure');
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    functionName = `verify_candidate_event_failure_${suffix}`;
    triggerName = `verify_candidate_event_trigger_${suffix}`;
    await db.query(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.data->>'scanResultId' = '${transactionFailure.resultId}' THEN
          RAISE EXCEPTION 'candidate orchestration journal verification failure';
        END IF;
        RETURN NEW;
      END; $$`);
    await db.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON trade_events
      FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
    const failed = await api(`/candidates/from-scan-result/${transactionFailure.resultId}`);
    assert.equal(failed.status, 500, JSON.stringify(failed.body));
    assert.equal((await db.query('SELECT count(*)::int AS count FROM trade_candidates WHERE scan_result_id=$1',
      [transactionFailure.resultId])).rows[0].count, 0);

    console.log('PASS A: accepted risk created one complete NEW candidate and CANDIDATE_CREATED event.');
    console.log('PASS B: duplicate orchestration returned ALREADY_EXISTS without another row.');
    console.log('PASS C: risk rejection preserved codes and scanner evidence without a candidate.');
    console.log('PASS D-G: unqualified, non-shortlisted, incomplete, and stale scans were rejected.');
    console.log('PASS H: concurrent requests produced CREATED + ALREADY_EXISTS and one candidate.');
    console.log('PASS I: forced journal failure rolled back candidate insertion.');
  } finally {
    if (triggerName) await db.query(`DROP TRIGGER IF EXISTS ${triggerName} ON trade_events`);
    if (functionName) await db.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    if (runIds.length) {
      await db.query(`DELETE FROM trade_events WHERE candidate_id IN
        (SELECT id FROM trade_candidates WHERE scan_run_id=ANY($1::uuid[]))`, [runIds]);
      await db.query('DELETE FROM trade_candidates WHERE scan_run_id=ANY($1::uuid[])', [runIds]);
      await db.query('DELETE FROM scan_runs WHERE id=ANY($1::uuid[])', [runIds]);
    }
    if (profile) {
      await db.query(`UPDATE trading_profiles SET name=$2, currency=$3, account_capital=$4,
        risk_per_trade_percent=$5, max_position_percent=$6, max_open_portfolio_risk_percent=$7,
        max_sector_exposure_percent=$8, minimum_risk_reward_ratio=$9, max_open_trades=$10,
        is_active=$11, created_at=$12, updated_at=$13 WHERE id=$1`,
      [profile.id, profile.name, profile.currency, profile.account_capital,
        profile.risk_per_trade_percent, profile.max_position_percent,
        profile.max_open_portfolio_risk_percent, profile.max_sector_exposure_percent,
        profile.minimum_risk_reward_ratio, profile.max_open_trades, profile.is_active,
        profile.created_at, profile.updated_at]);
    }
    await db.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
