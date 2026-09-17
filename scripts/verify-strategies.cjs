// No database or provider needed. Synthetic histories feed the real IndicatorsModule.
const assert = require('node:assert/strict');
const Decimal = require('decimal.js');
const { NestFactory } = require('@nestjs/core');
const { IndicatorsService } = require('../dist/indicators/indicators.service');
const { StrategyService } = require('../dist/strategy/strategy.service');
const { StrategyModule } = require('../dist/strategy/strategy.module');
const { MomentumBreakoutStrategy } = require('../dist/strategy/momentum-breakout/momentum-breakout.strategy');
const { TrendPullbackStrategy } = require('../dist/strategy/trend-pullback/trend-pullback.strategy');
const { scoreBand, scoreLinearRange, d } = require('../dist/strategy/shared/scoring');
const indicatorService = new IndicatorsService();
const service = new StrategyService(new MomentumBreakoutStrategy(), new TrendPullbackStrategy());
const decimal = value => new Decimal(value);
const format = value => decimal(value).toFixed(4);

function candle(index, value, volume = '1000000') {
  const close = decimal(value);
  return { timestamp: new Date(Date.UTC(2025, 0, index + 1)), open: format(close),
    high: format(close.plus(1)), low: format(close.minus(1)), close: format(close), volume };
}
const benchmark = Array.from({ length: 240 }, (_, index) => candle(index, decimal(1000).minus(index), null));
function breakoutHistory() {
  const rows = Array.from({ length: 240 }, (_, index) => candle(index,
    index < 220 ? decimal(80).plus(decimal(index).times('0.1')) : decimal('101.5').plus(index % 2 ? '0.5' : '0')));
  rows[239] = { ...candle(239, '104', '1800000'), open: '102', high: '104.5', low: '101.8' };
  return rows;
}
function pullbackHistory() {
  const tail = ['116', '115.5', '115', '114', '113', '112', '111', '110.5', '110.2', '111.2'];
  const rows = Array.from({ length: 240 }, (_, index) => candle(index,
    index < 230 ? decimal(80).plus(decimal(index).times('0.15')) : tail[index - 230],
    index >= 236 ? '500000' : '1000000'));
  rows[239] = { ...rows[239], open: '110.3', high: '111.5', low: '110', volume: '800000' };
  return rows;
}
function input(rows, regime = 'BULLISH') {
  const asOf = rows.at(-1).timestamp.toISOString();
  return { instrument: { symbol: 'VERIFY', exchange: 'NSE', sector: 'Technology' }, candles: rows,
    indicators: indicatorService.calculateTechnicalSnapshot(rows, benchmark),
    marketRegime: { regime, score: '60.0000', confidence: 'HIGH', version: 'market-regime-v1',
      marketDate: asOf.slice(0, 10), calculatedAt: new Date(asOf), components: {}, reasons: [], warnings: [] },
    evaluatedAt: new Date(rows.at(-1).timestamp.getTime() + 43200000),
    sectorContext: { sector: 'Technology', strengthScore: '80', asOf } };
}
function reject(result, code) {
  assert.equal(result.qualified, false, JSON.stringify(result));
  assert.ok(result.rejectionCodes.includes(code), JSON.stringify(result));
}
function audit(result) {
  assert.ok(decimal(result.score).gte(0) && decimal(result.score).lte(100));
  const components = Object.values(result.components);
  if (!components.length) { assert.equal(result.score, '0.0000'); return; }
  assert.equal(components.reduce((sum, item) => sum.plus(item.weight), decimal(0)).toFixed(4), '100.0000');
  assert.equal(components.reduce((sum, item) => sum.plus(item.weightedContribution), decimal(0)).toFixed(4), result.score);
  for (const item of components) {
    assert.ok(decimal(item.score).gte(0) && decimal(item.score).lte(100));
    assert.ok(Object.keys(item.evidence).length > 0);
  }
}

async function main() {
  const breakoutInput = input(breakoutHistory());
  const pullbackInput = input(pullbackHistory());
  const breakout = service.evaluateMomentumBreakout(breakoutInput);
  const pullback = service.evaluateTrendPullback(pullbackInput);
  assert.equal(breakout.qualified, true, JSON.stringify(breakout));
  assert.equal(pullback.qualified, true, JSON.stringify(pullback));
  assert.equal(breakout.setupContext.breakoutLevel, '103.0000');
  assert.equal(breakout.components.volumeConfirmation.evidence.priorVolumeRatio, '1.8000');
  assert.equal(pullback.components.volumeContraction.evidence.contractionRatio, '0.5000');

  const noBreakoutRows = breakoutHistory();
  noBreakoutRows[239] = candle(239, '102');
  reject(service.evaluateMomentumBreakout(input(noBreakoutRows)), 'NO_BREAKOUT');
  const equalityRows = breakoutHistory();
  equalityRows[239] = candle(239, '103');
  reject(service.evaluateMomentumBreakout(input(equalityRows)), 'NO_BREAKOUT');

  const extendedRows = breakoutHistory();
  extendedRows[239] = candle(239, '130', '1800000');
  const extended = service.evaluateMomentumBreakout(input(extendedRows));
  assert.ok(decimal(extended.components.extensionRisk.score).lt(breakout.components.extensionRisk.score));
  assert.ok(decimal(extended.score).lt(breakout.score));
  reject(extended, 'SETUP_SCORE_TOO_LOW');
  for (const evaluation of service.evaluateAll(input(breakoutHistory(), 'RISK_OFF'))) reject(evaluation, 'RISK_OFF_REGIME');

  const tooDeep = pullbackHistory();
  tooDeep[239] = candle(239, '90');
  reject(service.evaluateTrendPullback(input(tooDeep)), 'PULLBACK_TOO_DEEP');
  const noPullback = pullbackHistory();
  noPullback[239] = candle(239, '120');
  reject(service.evaluateTrendPullback(input(noPullback)), 'PULLBACK_NOT_PRESENT');
  const short = input(breakoutHistory().slice(-100));
  for (const result of service.evaluateAll(short)) reject(result, 'INSUFFICIENT_HISTORY');
  for (const field of ['sma200', 'atr14', 'relativeStrength20', 'relativeStrength50']) {
    const missing = structuredClone(breakoutInput);
    missing.indicators[field] = null;
    for (const result of service.evaluateAll(missing)) reject(result, 'INSUFFICIENT_HISTORY');
  }

  const illiquidRows = breakoutHistory().map(row => ({ ...row, volume: '10' }));
  // An enormous current-candle volume must not make an illiquid baseline eligible.
  illiquidRows[239].volume = '90000000000000';
  for (const result of service.evaluateAll(input(illiquidRows))) reject(result, 'INSUFFICIENT_LIQUIDITY');

  const invalidCases = [
    candidate => candidate.candles.reverse(),
    candidate => { candidate.candles[0].close = '-1'; },
    candidate => { candidate.candles[0].volume = null; },
    candidate => { candidate.candles[0].timestamp = new Date('bad'); },
    candidate => { candidate.candles[1].timestamp = candidate.candles[0].timestamp; },
    candidate => { candidate.indicators.close = '200'; },
    candidate => { candidate.indicators.rsi14 = '101'; },
    candidate => { candidate.indicators.ema20 = 'NaN'; },
    candidate => { candidate.indicators.ema50 = '0'; },
    candidate => { candidate.marketRegime.marketDate = '2025-01-01'; },
    candidate => { candidate.evaluatedAt = new Date('2020-01-01'); },
  ];
  for (const mutate of invalidCases) {
    const invalid = structuredClone(breakoutInput); mutate(invalid);
    for (const result of service.evaluateAll(invalid)) reject(result, 'INVALID_DATA');
  }
  const noSector = structuredClone(breakoutInput); delete noSector.sectorContext;
  const noSectorResult = service.evaluateMomentumBreakout(noSector);
  assert.equal(noSectorResult.qualified, true);
  assert.equal(noSectorResult.components.sectorStrength.score, '50.0000');
  assert.ok(noSectorResult.warningCodes.includes('SECTOR_CONTEXT_UNAVAILABLE'));
  const wrongSector = structuredClone(breakoutInput); wrongSector.sectorContext.sector = 'Banking';
  assert.ok(service.evaluateMomentumBreakout(wrongSector).warningCodes.includes('SECTOR_CONTEXT_INVALID'));
  const optionalRs = structuredClone(breakoutInput); optionalRs.indicators.relativeStrength126 = null;
  assert.ok(service.evaluateMomentumBreakout(optionalRs).warningCodes.includes('RELATIVE_STRENGTH_126_UNAVAILABLE'));

  const neutral = service.evaluateMomentumBreakout(input(breakoutHistory(), 'NEUTRAL'));
  assert.ok(!neutral.rejectionCodes.includes('REGIME_NOT_ALLOWED'));
  assert.ok(decimal(neutral.score).lt(breakout.score));

  // No wall clock, input mutation, or dependence on the global Decimal precision.
  const before = structuredClone(breakoutInput);
  for (let i = 0; i < 5; i++) assert.deepEqual(service.evaluateMomentumBreakout(breakoutInput), breakout);
  assert.deepEqual(breakoutInput, before);
  Decimal.set({ precision: 6 });
  assert.deepEqual(service.evaluateMomentumBreakout(breakoutInput), breakout);
  Decimal.set({ precision: 20 });
  const all = service.evaluateAll(breakoutInput);
  assert.deepEqual(all.map(result => result.strategy), ['MOMENTUM_BREAKOUT', 'TREND_PULLBACK']);
  for (const result of [breakout, pullback, extended, neutral, noSectorResult, ...all]) audit(result);

  assert.equal(scoreBand(d(55), ['40', '55', '68', '85']).toString(), '100');
  assert.equal(scoreBand(d(85), ['40', '55', '68', '85']).toString(), '0');
  assert.equal(scoreLinearRange(d('0.3'), '0.1', '0.5').toString(), '50');

  // Validate Nest injection independently; no full app startup or external services.
  const app = await NestFactory.createApplicationContext(StrategyModule, { logger: false });
  try { assert.deepEqual(app.get(StrategyService).evaluateAll(breakoutInput), all); }
  finally { await app.close(); }
  console.log(`PASS: breakout ${breakout.score}; pullback ${pullback.score}; overextended ${extended.score}.`);
  console.log('PASS: structural boundaries, liquidity, regimes, missing/invalid data, optional context, score audit, determinism and Nest module.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
