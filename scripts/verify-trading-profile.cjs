// Run against a development API/database with its active profile restored afterward.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { existsSync } = require('node:fs');
if (existsSync('.env')) process.loadEnvFile('.env');
const endpoint = (process.env.VERIFY_API_URL || 'http://localhost:3000/api') + '/settings/trading-profile';
const payload = {
  name: 'Verification ' + randomUUID(), currency: 'INR', accountCapital: '500000.1234', riskPerTradePercent: '0.5001',
  maxPositionPercent: '20.0000', maxOpenPortfolioRiskPercent: '2.5000',
  maxOpenTrades: 6, maxSectorExposurePercent: '30.0000', minimumRiskRewardRatio: '2.0000',
  isActive: true,
};
async function request(method = 'GET', data, status = 200) {
  const response = await fetch(endpoint, {
    method, headers: { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(10000),
  });
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}
async function main() {
  const db = new Client({
    host: process.env.VERIFY_DATABASE_HOST || 'localhost', port: Number(process.env.DATABASE_PORT || 5432),
    database: process.env.DATABASE_NAME, user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD,
  });
  await db.connect();
  let original;
  try {
    original = await request();
    assert.equal((await db.query('SELECT id FROM trading_profiles WHERE is_active')).rowCount, 1);
    // allSettled ensures every concurrent write finishes before cleanup, even on failure.
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => request('PUT', payload)));
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    const created = results.map(result => result.value);
    assert.equal(new Set(created.map(profile => profile.id)).size, 1);
    assert.equal(created[0].id, original.id);
    assert.equal((await db.query('SELECT id FROM trading_profiles WHERE is_active')).rowCount, 1);
    const first = await request();
    for (const [key, value] of Object.entries(payload)) assert.equal(first[key], value);
    const updated = await request('PUT', { ...payload, accountCapital: '90071992547409.1234', riskPerTradePercent: '0.7501' });
    assert.equal(updated.id, first.id);
    assert.equal(updated.createdAt, first.createdAt);
    assert.ok(new Date(updated.updatedAt) > new Date(first.updatedAt));
    assert.equal(updated.accountCapital, '90071992547409.1234');
    assert.equal(updated.riskPerTradePercent, '0.7501');
    assert.deepEqual(await request(), updated);
    const row = (await db.query('SELECT account_capital, risk_per_trade_percent FROM trading_profiles WHERE id=$1', [first.id])).rows[0];
    assert.equal(row.account_capital, updated.accountCapital);
    assert.equal(row.risk_per_trade_percent, updated.riskPerTradePercent);
    const invalid = [
      { accountCapital: '0' }, { accountCapital: null }, { accountCapital: 500000 },
      { accountCapital: '1.12345' }, { accountCapital: '100000000000000' }, { accountCapital: 'NaN' },
      { riskPerTradePercent: '-1' }, { riskPerTradePercent: '101' },
      { riskPerTradePercent: '3', maxOpenPortfolioRiskPercent: '2.5' },
      { maxPositionPercent: '101' }, { maxOpenPortfolioRiskPercent: '101' },
      { maxSectorExposurePercent: '101' }, { maxOpenTrades: 0 }, { maxOpenTrades: 1.5 },
      { minimumRiskRewardRatio: '0' }, { currency: '' }, { currency: 'inr' },
      { name: '   ' }, { isActive: false }, { isActive: null }, { extra: true },
    ];
    for (const patch of invalid) await request('PUT', { ...payload, ...patch }, 400);
    await request('PUT', {}, 400);
    assert.deepEqual(await request(), updated);
    await assert.rejects(db.query(`INSERT INTO trading_profiles
      SELECT $1::uuid, name, currency, account_capital, risk_per_trade_percent,
        max_position_percent, max_open_portfolio_risk_percent, max_sector_exposure_percent,
        minimum_risk_reward_ratio, max_open_trades, is_active, created_at, updated_at
      FROM trading_profiles WHERE id=$2`, [randomUUID(), first.id]), { code: '23505' });
    await assert.rejects(db.query('UPDATE trading_profiles SET account_capital=0 WHERE id=$1', [first.id]), { code: '23514' });
    await assert.rejects(db.query('UPDATE trading_profiles SET risk_per_trade_percent=3 WHERE id=$1', [first.id]), { code: '23514' });
    console.log('PASS: default profile, concurrent update, persisted read/update, exact decimals, 22 invalid requests, DB uniqueness and checks.');
  } finally {
    if (original) {
      const { id, createdAt, updatedAt, ...restore } = original;
      await request('PUT', restore);
    }
    await db.end();
  }
  const restored = await request();
  for (const [key, value] of Object.entries(original)) {
    if (key !== 'updatedAt') assert.equal(restored[key], value);
  }
  console.log('PASS: original active profile restored.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
