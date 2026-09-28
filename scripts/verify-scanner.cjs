// Deterministic scanner verification; no provider, PostgreSQL, or Redis required.
const assert = require('node:assert/strict');
const Decimal = require('decimal.js');
const { IndicatorsService } = require('../dist/indicators/indicators.service');
const { MomentumBreakoutStrategy } = require('../dist/strategy/momentum-breakout/momentum-breakout.strategy');
const { TrendPullbackStrategy } = require('../dist/strategy/trend-pullback/trend-pullback.strategy');
const { StrategyService } = require('../dist/strategy/strategy.service');
const { ScannerEvaluationService } = require('../dist/scanner/scanner-evaluation.service');
const { CrossSectionalRanking } = require('../dist/scanner/ranking/cross-sectional-ranking');

const indicators = new IndicatorsService();
const strategies = new StrategyService(new MomentumBreakoutStrategy(), new TrendPullbackStrategy());
const evaluator = new ScannerEvaluationService(indicators, strategies);
const ranking = new CrossSectionalRanking();
const decimal = value => new Decimal(value);
const fixed = value => decimal(value).toFixed(4);

function candle(index, value, volume = '1000000') {
  const close = decimal(value);
  return { timestamp: new Date(Date.UTC(2025, 0, index + 1)), open: fixed(close),
    high: fixed(close.plus(1)), low: fixed(close.minus(1)), close: fixed(close), volume };
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
function instrument(id, symbol, sector = null) {
  return { id, symbol, exchange: 'NSE', name: symbol, type: 'EQUITY', sector, industry: null,
    provider: null, providerInstrumentId: null, providerSymbol: null, providerMetadata: null,
    isActive: true, createdAt: new Date(), updatedAt: new Date() };
}
function regime() {
  const marketDate = benchmark.at(-1).timestamp.toISOString().slice(0, 10);
  return { regime: 'BULLISH', score: '70.0000', confidence: 'HIGH', version: 'market-regime-v1',
    marketDate, calculatedAt: new Date(`${marketDate}T10:00:00.000Z`), components: {}, reasons: [], warnings: [] };
}
function evaluationInput(items) {
  return { instruments: items, benchmarkCandles: benchmark, marketRegime: regime(),
    evaluatedAt: new Date(benchmark.at(-1).timestamp.getTime() + 43200000) };
}
function cloneSetup(base, overrides) {
  const copy = structuredClone(base);
  Object.assign(copy, overrides);
  copy.strategyResult.score = copy.strategyScore;
  return copy;
}
function setRankFeatures(setup, score, rs, liquidity, sectorStrength = null) {
  setup.strategyScore = fixed(score);
  setup.strategyResult.score = fixed(score);
  for (const name of ['relativeStrength20', 'relativeStrength50', 'relativeStrength126']) {
    if (setup.technicalSnapshot[name]) setup.technicalSnapshot[name].excessReturnPercent = fixed(rs);
  }
  setup.technicalSnapshot.averageTradedValue20 = fixed(liquidity);
  const sector = setup.strategyResult.components.sectorStrength;
  sector.evidence.usable = sectorStrength !== null;
  sector.evidence.suppliedStrength = sectorStrength === null ? null : fixed(sectorStrength);
  sector.score = sectorStrength === null ? '50.0000' : fixed(sectorStrength);
  return setup;
}

function main() {
  const baseEvaluation = evaluator.evaluate(evaluationInput([
    { instrument: instrument('base-breakout', 'BASEBREAK', 'Technology'), candles: breakoutHistory() },
    { instrument: instrument('base-pullback', 'BASEPULL', 'Financials'), candles: pullbackHistory() },
  ]));
  const breakout = baseEvaluation.qualifiedSetups.find(item => item.strategy === 'MOMENTUM_BREAKOUT');
  const pullback = baseEvaluation.qualifiedSetups.find(item => item.strategy === 'TREND_PULLBACK');
  assert.ok(breakout?.strategyResult.qualified);
  assert.ok(pullback?.strategyResult.qualified);

  // A/B: valid setups enter ranking only after qualification and rank within strategy.
  const setups = [
    setRankFeatures(cloneSetup(breakout, { instrumentId: 'bo-a', symbol: 'ALPHA' }), 94, 12, 900000000, 90),
    setRankFeatures(cloneSetup(breakout, { instrumentId: 'bo-b', symbol: 'BETA' }), 84, 7, 500000000, 70),
    setRankFeatures(cloneSetup(breakout, { instrumentId: 'bo-c', symbol: 'GAMMA' }), 74, 2, 100000000, null),
    setRankFeatures(cloneSetup(pullback, { instrumentId: 'pb-a', symbol: 'DELTA' }), 91, 10, 800000000, 85),
    setRankFeatures(cloneSetup(pullback, { instrumentId: 'pb-b', symbol: 'EPSILON' }), 79, 4, 250000000, null),
  ];
  assert.ok(setups.every(item => item.strategyResult.qualified));
  const ranked = ranking.rank(setups);
  const breakoutRanked = ranked.filter(item => item.strategy === 'MOMENTUM_BREAKOUT');
  const pullbackRanked = ranked.filter(item => item.strategy === 'TREND_PULLBACK');
  assert.equal(breakoutRanked.find(item => item.strategyRank === 1).symbol, 'ALPHA');
  assert.equal(pullbackRanked.find(item => item.strategyRank === 1).symbol, 'DELTA');
  assert.equal(new Set(breakoutRanked.map(item => item.rankingScore)).size, 3);
  assert.ok(ranked[0].rankingFeatures.relativeStrength.percentileWithinStrategy);
  assert.ok(ranked[0].rankingFeatures.liquidity.percentileWithinStrategy);
  assert.ok(ranked[0].rankingFeatures.rankingComponents.strategyScore);

  // C: one instrument may retain two separate strategy hypotheses.
  const dual = ranking.rank([
    setRankFeatures(cloneSetup(breakout, { instrumentId: 'dual', symbol: 'DUAL' }), 88, 8, 600000000),
    setRankFeatures(cloneSetup(pullback, { instrumentId: 'dual', symbol: 'DUAL' }), 82, 6, 600000000),
  ]);
  assert.deepEqual(dual.map(item => item.strategy).sort(), ['MOMENTUM_BREAKOUT', 'TREND_PULLBACK']);

  // D: missing sector evidence removes that weight and does not apply a zero.
  const missingSector = ranked.find(item => item.symbol === 'GAMMA');
  assert.equal(missingSector.rankingFeatures.sectorStrength.available, false);
  assert.equal(missingSector.rankingFeatures.sectorStrength.missingBehavior, 'WEIGHTS_RENORMALIZED');
  assert.equal(missingSector.rankingFeatures.availableWeight, '95.0000');
  assert.ok(decimal(missingSector.rankingScore).gt(0));

  // E: malformed symbol data is isolated while a valid symbol is still evaluated.
  const malformed = breakoutHistory();
  malformed[25] = { ...malformed[25], high: '1.0000' };
  const isolated = evaluator.evaluate(evaluationInput([
    { instrument: instrument('valid', 'VALID'), candles: breakoutHistory() },
    { instrument: instrument('invalid', 'INVALID'), candles: malformed },
    { instrument: instrument('short', 'SHORT'), candles: breakoutHistory().slice(-100) },
  ]));
  assert.equal(isolated.evaluatedSymbols, 1);
  assert.equal(isolated.exclusions.filter(item => item.code === 'INVALID_DATA').length, 1);
  assert.equal(isolated.exclusions.filter(item => item.code === 'INSUFFICIENT_HISTORY').length, 1);
  assert.ok(isolated.qualifiedSetups.length > 0);

  // F: essential benchmark/regime mismatch stops evaluation before any setup exists.
  assert.throws(() => evaluator.evaluate({ ...evaluationInput([]), benchmarkCandles: benchmark.slice(-100) }),
    /NIFTY benchmark requires/);
  assert.throws(() => evaluator.evaluate({ ...evaluationInput([]),
    marketRegime: { ...regime(), marketDate: '2020-01-01' } }), /NIFTY benchmark is not usable/);

  // G: equal scoring inputs use symbol ascending as the stable tie-breaker.
  const tieA = setRankFeatures(cloneSetup(breakout, { instrumentId: 'tie-a', symbol: 'A-TIE' }), 80, 5, 200000000);
  const tieB = setRankFeatures(cloneSetup(breakout, { instrumentId: 'tie-b', symbol: 'B-TIE' }), 80, 5, 200000000);
  const ties = ranking.rank([tieB, tieA]);
  assert.deepEqual(ties.map(item => item.symbol), ['A-TIE', 'B-TIE']);
  assert.equal(ties[0].rankingScore, ties[1].rankingScore);

  // Ranking is deterministic and shortlist metadata is complete.
  assert.deepEqual(ranking.rank(setups), ranked);
  assert.ok(ranked.every(item => item.strategyQualifiedCount > 0 && item.globalQualifiedCount === ranked.length));
  assert.ok(ranked.every(item => item.rankingFeatures.sectorConcentration.usedAsRejection === false));
  console.log('PASS A-D: cross-sectional strategy ranking, dual hypotheses, evidence, and missing sector handling.');
  console.log('PASS E-G: symbol isolation, essential benchmark failure, deterministic ties, global ranks, and shortlist metadata.');
  console.log('Scenario H is verified against PostgreSQL by the scan_run_date_version_unique constraint after Flyway migrate.');
}

main();
