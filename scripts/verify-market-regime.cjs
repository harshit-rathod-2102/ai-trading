// Build first. Verifies deterministic scenarios, the real endpoint, and snapshot constraints.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');
const { Client } = require('pg');
const { calculateMarketRegime } = require('../dist/market-regime/calculations/calculate-regime');
const { calculateBreadthSnapshot } = require('../dist/market-regime/calculations/breadth-score');
const { calculateSectorParticipationSnapshot } = require('../dist/market-regime/calculations/sector-participation-score');
if (existsSync('.env')) process.loadEnvFile('.env');

function indicators(fields = {}) {
  return {
    asOf: '2026-09-11T00:00:00.000Z', close: '120', sma20: null, sma50: null,
    sma200: '90', ema20: '110', ema50: '100', rsi14: '65', atr14: null,
    normalizedAtr14: '1.2', roc20: '6', roc50: '12', rollingHigh20: null,
    rollingLow20: null, rollingHigh50: null, rollingLow50: null,
    distanceFromRollingHigh20Percent: null, distanceFromRollingLow20Percent: null,
    volumeAverage20: null, volumeRatio20: null, averageTradedValue20: null,
    distanceFromEma20Percent: null, distanceFromEma50Percent: null,
    distanceFromSma200Percent: null, relativeStrength20: null, relativeStrength50: null,
    relativeStrength126: null, ...fields,
  };
}
function breadth(percent) {
  return {
    totalUniverse: 100, totalEligible: 100, totalExcluded: 0,
    aboveEma20: percent, aboveEma50: percent, aboveSma200: percent,
    percentAboveEma20: String(percent), percentAboveEma50: String(percent),
    percentAboveSma200: String(percent),
  };
}
function sectors(percent) {
  return {
    totalClassifiedInstruments: 100, totalExcludedInstruments: 0, eligibleSectors: 10,
    positiveSectors: percent / 10, negativeSectors: 10 - percent / 10, neutralSectors: 0,
    positiveSectorPercent: String(percent),
  };
}
function input(fields = {}) {
  return {
    marketDate: '2026-09-11', calculatedAt: new Date('2026-09-11T11:00:00.000Z'),
    niftyFreshness: 'CURRENT', niftyIndicators: indicators(),
    vixFreshness: 'CURRENT', vixIndicators: indicators({ close: '12' }),
    breadth: breadth(80), sectorParticipation: sectors(80), ...fields,
  };
}

const bullish = calculateMarketRegime(input());
assert.equal(bullish.regime, 'BULLISH');
assert.equal(bullish.score, '82.5000');
assert.equal(bullish.confidence, 'HIGH');
assert.deepEqual(bullish, calculateMarketRegime(input()));

const mixed = calculateMarketRegime(input({
  niftyIndicators: indicators({ close: '105', ema20: '110', ema50: '115', sma200: '90', rsi14: '44', roc20: '-2', roc50: '5' }),
  breadth: breadth(50), sectorParticipation: sectors(50),
}));
assert.equal(mixed.regime, 'NEUTRAL');

const bearish = calculateMarketRegime(input({
  niftyIndicators: indicators({ close: '80', ema20: '90', ema50: '100', sma200: '110', rsi14: '38', roc20: '-6', roc50: '-12', normalizedAtr14: '2' }),
  vixIndicators: indicators({ close: '20' }), breadth: breadth(20), sectorParticipation: sectors(20),
}));
assert.equal(bearish.regime, 'BEARISH');

const riskOff = calculateMarketRegime(input({
  niftyIndicators: indicators({ close: '80', ema20: '90', ema50: '100', sma200: '110', rsi14: '38', roc20: '-6', roc50: '-12', normalizedAtr14: '5' }),
  vixIndicators: indicators({ close: '35' }), breadth: breadth(10), sectorParticipation: sectors(10),
}));
assert.equal(riskOff.regime, 'RISK_OFF');

const withoutVix = calculateMarketRegime(input({ vixFreshness: undefined, vixIndicators: undefined }));
assert.equal(withoutVix.regime, 'BULLISH');
assert.equal(withoutVix.confidence, 'MEDIUM');
assert.ok(withoutVix.warnings.includes('INDIA_VIX_UNAVAILABLE'));
assert.throws(() => calculateMarketRegime(input({ niftyFreshness: 'STALE' })), /not current/);
assert.throws(() => calculateMarketRegime(input({ niftyIndicators: indicators({ sma200: null }) })), /incomplete/);

const observations = [
  { instrumentId: 'one', sector: 'Technology', indicators: indicators({ close: '110', ema20: '100', ema50: '100', sma200: '100', roc20: '10' }) },
  { instrumentId: 'two', sector: 'Technology', indicators: indicators({ close: '90', ema20: '100', ema50: '100', sma200: '100', roc20: '-2' }) },
  { instrumentId: 'three', sector: 'Banking', indicators: indicators({ close: '90', ema20: '100', ema50: '100', sma200: '100', roc20: '-1' }) },
  { instrumentId: 'four', sector: null, indicators: indicators({ ema50: null, roc20: null }) },
];
assert.deepEqual(calculateBreadthSnapshot(observations), {
  totalUniverse: 4, totalEligible: 3, totalExcluded: 1,
  aboveEma20: 1, aboveEma50: 1, aboveSma200: 1,
  percentAboveEma20: '33.3333', percentAboveEma50: '33.3333', percentAboveSma200: '33.3333',
});
assert.deepEqual(calculateSectorParticipationSnapshot(observations), {
  totalClassifiedInstruments: 3, totalExcludedInstruments: 1, eligibleSectors: 2,
  positiveSectors: 1, negativeSectors: 1, neutralSectors: 0, positiveSectorPercent: '50.0000',
});

async function integration() {
  const response = await fetch((process.env.VERIFY_API_URL || 'http://localhost:3000/api') + '/market-regime');
  const body = await response.json();
  if (response.status === 200) {
    for (const field of ['regime', 'score', 'confidence', 'version', 'marketDate', 'calculatedAt', 'components', 'reasons', 'warnings']) {
      assert.ok(field in body, `endpoint response is missing ${field}`);
    }
  } else {
    assert.equal(response.status, 503, JSON.stringify(body));
    assert.match(JSON.stringify(body), /NIFTY 50/);
  }
  const db = new Client({
    host: process.env.VERIFY_DATABASE_HOST || 'localhost', port: Number(process.env.DATABASE_PORT || 5432),
    database: process.env.DATABASE_NAME, user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD,
  });
  const id = randomUUID();
  const version = 'verify-' + randomUUID();
  await db.connect();
  try {
    await db.query(`INSERT INTO market_regime_snapshots
      (id, market_date, regime, score, confidence, version, components, reasons, warnings, calculated_at)
      VALUES ($1, '2099-12-31', 'BULLISH', 82.5, 'HIGH', $2, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, NOW())`, [id, version]);
    await assert.rejects(db.query(`INSERT INTO market_regime_snapshots
      (id, market_date, regime, score, confidence, version, components, reasons, warnings, calculated_at)
      VALUES ($1, '2099-12-31', 'NEUTRAL', 0, 'LOW', $2, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, NOW())`,
    [randomUUID(), version]), { code: '23505' });
  } finally {
    await db.query('DELETE FROM market_regime_snapshots WHERE id=$1', [id]);
    await db.end();
  }
  console.log(`PASS: endpoint ${response.status}; snapshot uniqueness verified and test row removed.`);
}

integration().then(() => console.log('PASS: bullish, neutral, bearish, risk-off, missing data, breadth, sectors and determinism.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
