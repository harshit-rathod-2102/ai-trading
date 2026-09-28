// Build first, then run this deterministic known-answer verification.
const assert = require('node:assert/strict');
const { calculateSma } = require('../dist/indicators/calculations/sma');
const { calculateEma } = require('../dist/indicators/calculations/ema');
const { calculateRsi } = require('../dist/indicators/calculations/rsi');
const { calculateAtr, calculateNormalizedAtr } = require('../dist/indicators/calculations/atr');
const { calculateRoc } = require('../dist/indicators/calculations/roc');
const { calculateRollingHigh, calculateRollingLow } = require('../dist/indicators/calculations/rolling-range');
const { calculateAverageVolume, calculateVolumeRatio } = require('../dist/indicators/calculations/volume');
const { alignCandleSeries, calculateRelativeStrength } = require('../dist/indicators/calculations/relative-strength');
const { IndicatorsService } = require('../dist/indicators/indicators.service');

function candle(date, close, { open = close, high = close, low = close, volume = '100' } = {}) {
  return { timestamp: new Date(date + 'T00:00:00.000Z'), open, high, low, close, volume };
}

assert.equal(calculateSma(['1', '2', '3', '4', '5'], 5), '3.0000');
assert.equal(calculateSma(['1', '2'], 3), null);
assert.equal(calculateEma(['1', '2', '3', '4', '5'], 3), '4.0000');
assert.equal(calculateRsi(['1', '2', '3', '4'], 3), '100.0000');
assert.equal(calculateRsi(['4', '3', '2', '1'], 3), '0.0000');
assert.equal(calculateRsi(['2', '2', '2', '2'], 3), '50.0000');

const gap = [
  candle('2026-01-01', '9', { open: '9', high: '10', low: '8' }),
  candle('2026-01-02', '14.5', { open: '14', high: '15', low: '14' }),
];
assert.equal(calculateAtr(gap, 2), '4.0000'); // TRs are 2 and 6; second uses the prior close gap.
assert.equal(calculateNormalizedAtr('4.0000', '16'), '25.0000');
assert.equal(calculateRoc(['100', '105', '110'], 2), '10.0000');
assert.equal(calculateRollingHigh(gap, 2), '15.0000');
assert.equal(calculateRollingLow(gap, 2), '8.0000');

const volumeCandles = [
  candle('2026-01-01', '10', { volume: '100' }), candle('2026-01-02', '10', { volume: '100' }),
  candle('2026-01-03', '10', { volume: '100' }), candle('2026-01-04', '10', { volume: '200' }),
];
assert.equal(calculateAverageVolume(volumeCandles, 4), '125.0000');
assert.equal(calculateVolumeRatio(volumeCandles, 3), '2.0000');
assert.equal(calculateVolumeRatio(volumeCandles.slice(0, 3), 3), null);

const stock = [candle('2026-01-01', '100'), candle('2026-01-02', '105'), candle('2026-01-03', '110')];
const benchmark = [candle('2026-01-01', '100'), candle('2026-01-03', '104')];
const aligned = alignCandleSeries(stock, benchmark);
assert.deepEqual(aligned.map(row => row.date), ['2026-01-01', '2026-01-03']);
assert.deepEqual(calculateRelativeStrength(aligned, 1), {
  period: 1, stockReturnPercent: '10.0000', benchmarkReturnPercent: '4.0000',
  excessReturnPercent: '6.0000', currentPriceRatio: '1.0577', priceRatioChangePercent: '5.7692',
});
assert.equal(calculateRelativeStrength(aligned, 2), null);

const service = new IndicatorsService();
const history = Array.from({ length: 201 }, (_, index) => {
  const close = String(100 + index);
  return candle(new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10), close, {
    open: close, high: String(101 + index), low: String(99 + index), volume: String(1000 + index),
  });
});
const snapshot = service.calculateTechnicalSnapshot(history, history);
assert.deepEqual(snapshot, service.calculateTechnicalSnapshot(history, history));
for (const field of ['sma20', 'sma50', 'sma200', 'ema20', 'ema50', 'rsi14', 'atr14',
  'normalizedAtr14', 'roc20', 'roc50', 'volumeAverage20', 'volumeRatio20',
  'averageTradedValue20', 'relativeStrength20', 'relativeStrength50', 'relativeStrength126']) {
  assert.notEqual(snapshot[field], null, `${field} should be calculated`);
}
assert.throws(() => service.calculateTechnicalSnapshot([...stock].reverse()), /oldest to newest/);
assert.throws(() => calculateSma(['1', '-2'], 2), /non-negative decimal string/);
assert.throws(() => calculateRoc(['0', '1'], 1), /greater than zero/);
assert.throws(() => alignCandleSeries(stock, [benchmark[0], {
  ...benchmark[0], timestamp: new Date('2026-01-01T12:00:00.000Z'),
}]), /duplicate date/);
assert.throws(() => alignCandleSeries([...stock].reverse(), benchmark), /oldest to newest/);
assert.equal(service.calculateTechnicalSnapshot([]).sma20, null);

console.log('PASS: SMA, EMA, RSI edges, gap-aware ATR, nATR, ROC, rolling range, volume baseline,');
console.log('      date-aligned relative strength, insufficient/invalid data, ordering and determinism.');
