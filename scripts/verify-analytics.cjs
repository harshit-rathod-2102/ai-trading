'use strict';

require('reflect-metadata');
const assert = require('node:assert/strict');
const {
  AnalyticsCalculationService,
} = require('../dist/analytics/analytics-calculation.service.js');
const { resolveAnalyticsRange } = require('../dist/analytics/analytics-query.service.js');

const calculation = new AnalyticsCalculationService();
const baseTime = Date.parse('2026-01-01T04:00:00.000Z');

function candidate(id, values = {}) {
  return {
    id,
    sector: 'Technology',
    quantScore: '80.0000',
    globalRank: 1,
    strategyRank: 1,
    marketRegimeSnapshot: { regime: 'BULLISH' },
    riskSnapshot: { accepted: true },
    ...values,
  };
}

function trade(id, values = {}) {
  const candidateId = `candidate-${id}`;
  return {
    id,
    candidateId,
    candidate: candidate(candidateId),
    symbol: `SYMBOL${id}`,
    strategy: 'MOMENTUM_BREAKOUT',
    strategyVersion: 'momentum-breakout-v1',
    actualEntry: '100',
    initialStop: '95',
    initialRiskAmount: '50',
    quantity: 10,
    realizedPnl: '0',
    maxFavorableR: null,
    maxAdverseR: null,
    entryDecisionAt: new Date(baseTime),
    closedAt: new Date(baseTime + 60 * 60 * 1000),
    ...values,
  };
}

function event(id, tradeId, eventType, values = {}) {
  return {
    id,
    tradeId,
    candidateId: `candidate-${tradeId}`,
    eventType,
    price: null,
    quantity: null,
    data: null,
    createdAt: new Date(baseTime),
    ...values,
  };
}

function performanceRecord(id, realizedPnl, realizedR, values = {}) {
  return {
    tradeId: id,
    candidateId: `candidate-${id}`,
    symbol: `SYMBOL${id}`,
    sector: 'Technology',
    strategy: 'MOMENTUM_BREAKOUT',
    strategyVersion: 'momentum-breakout-v1',
    marketRegime: 'BULLISH',
    openedAt: new Date(baseTime),
    closedAt: new Date(baseTime + Number(id.replace(/\D/g, '') || 1) * 60_000),
    initialQuantity: 10,
    entryPrice: '100.0000',
    initialStop: '95.0000',
    initialRiskPerShare: '5.0000',
    initialRiskAmount: '50.0000',
    realizedPnl: String(realizedPnl),
    realizedPnlSource: 'EXIT_EVENTS',
    realizedR: realizedR === null ? null : String(realizedR),
    mfeR: null,
    maeR: null,
    holdingMinutes: 60,
    quantScore: '80.0000',
    globalRank: 1,
    strategyRank: 1,
    warnings: [],
    ...values,
  };
}

// A: empty history.
const empty = calculation.summarize([]);
assert.equal(empty.totalClosedTrades, 0);
assert.equal(empty.netRealizedPnl, '0.0000');
assert.equal(empty.winRate, null);
assert.equal(empty.profitFactor, null);
assert.equal(empty.expectancyR, null);

// B and C: one winning and one losing trade use immutable initial risk.
const winner = calculation.normalizeTrades(
  [trade('winner')],
  [event('winner-open', 'winner', 'TRADE_OPENED', { quantity: 10 }), event('winner-close', 'winner', 'TRADE_CLOSED', { price: '110', quantity: 10 })],
)[0];
assert.equal(winner.initialRiskAmount, '50.0000');
assert.equal(winner.realizedPnl, '100.0000');
assert.equal(winner.realizedR, '2.0000');

const loser = calculation.normalizeTrades(
  [trade('loser')],
  [event('loser-close', 'loser', 'TRADE_CLOSED', { price: '95', quantity: 10 })],
)[0];
assert.equal(loser.realizedPnl, '-50.0000');
assert.equal(loser.realizedR, '-1.0000');

// D: mixed-trade expectancy and win rate.
const mixed = ['2', '-1', '1', '-1'].map((r, index) =>
  performanceRecord(`mixed${index + 1}`, String(Number(r) * 50), r),
);
const mixedMetrics = calculation.summarize(mixed);
assert.equal(mixedMetrics.averageR, '0.2500');
assert.equal(mixedMetrics.expectancyR, '0.2500');
assert.equal(mixedMetrics.winRate, '0.5000');

// E: partial exits use price times quantity for each realized portion.
const partial = calculation.normalizeTrades(
  [trade('partial', { realizedPnl: '999' })],
  [
    event('partial-one', 'partial', 'TRADE_CLOSED', { price: '105', quantity: 5 }),
    event('partial-two', 'partial', 'TRADE_CLOSED', { price: '110', quantity: 5 }),
  ],
)[0];
assert.equal(partial.realizedPnl, '75.0000');
assert.equal(partial.realizedR, '1.5000');
assert.equal(partial.realizedPnlSource, 'EXIT_EVENTS');

// F and G: profit factor and safe no-loss behavior.
assert.equal(
  calculation.summarize([
    performanceRecord('pf1', '300', '3'),
    performanceRecord('pf2', '-100', '-1'),
  ]).profitFactor,
  '3.0000',
);
assert.equal(calculation.summarize([performanceRecord('onlywin', '100', '2')]).profitFactor, null);

// H: chronological peak-to-trough drawdown.
const drawdown = [100, 50, -80, -100, 60].map((pnl, index) =>
  performanceRecord(`dd${index + 1}`, pnl, pnl / 50),
);
assert.equal(calculation.summarize(drawdown).maxDrawdown, '180.0000');

// I, J, and K: persisted strategy/version, regime, and UNKNOWN sector groups.
const grouping = [
  performanceRecord('group1', '100', '2'),
  performanceRecord('group2', '-50', '-1', {
    strategy: 'TREND_PULLBACK',
    strategyVersion: 'trend-pullback-v1',
    marketRegime: 'BEARISH',
    sector: null,
  }),
];
assert.equal(calculation.byStrategy(grouping).length, 2);
assert.deepEqual(
  calculation.byRegime(grouping).map((group) => group.regime),
  ['BEARISH', 'BULLISH'],
);
assert.ok(calculation.bySector(grouping).some((group) => group.sector === 'UNKNOWN'));

// L: every score boundary maps to exactly one configured bucket.
const scoreCandidates = ['59.9999', '60', '69.9999', '70', '79.9999', '80', '89.9999', '90', '100'].map(
  (score, index) => candidate(`score-${index}`, { quantScore: score }),
);
const buckets = calculation.byScoreBucket(scoreCandidates, []);
assert.deepEqual(
  buckets.filter((bucket) => bucket.key !== 'UNKNOWN').map((bucket) => bucket.candidateCount),
  [1, 2, 2, 2, 2],
);
assert.equal(buckets.reduce((total, bucket) => total + bucket.candidateCount, 0), 9);

// M: accepted and skipped counts are factual; skipped P&L stays unavailable.
const decisions = [
  event('accepted', 'accepted-trade', 'TRADE_OPENED', { candidateId: 'candidate-accepted' }),
  event('skipped', null, 'CANDIDATE_SKIPPED', { candidateId: 'candidate-skipped' }),
];
const comparison = calculation.acceptedVsSkipped(
  [performanceRecord('accepted', '100', '2')],
  decisions,
);
assert.equal(comparison.acceptedCount, 1);
assert.equal(comparison.skippedCount, 1);
assert.equal(comparison.acceptedClosedTrades, 1);
assert.equal(comparison.skippedOutcomeAvailable, false);

// N: missing excursion data is excluded rather than converted to zero.
const excursionCoverage = calculation.coverage([
  performanceRecord('excursion1', '100', '2', { mfeR: '2.5', maeR: '-0.5' }),
  performanceRecord('excursion2', '-50', '-1'),
]);
assert.equal(excursionCoverage.tradesWithMfeMae, 1);
assert.equal(calculation.summarize([
  performanceRecord('excursion1', '100', '2', { mfeR: '2.5', maeR: '-0.5' }),
  performanceRecord('excursion2', '-50', '-1'),
]).mfeMaeSampleSize, 1);

// O: inclusive Asia/Kolkata dates become an exclusive UTC upper bound.
const range = resolveAnalyticsRange({ from: '2026-01-01', to: '2026-01-02' });
assert.equal(range.start.toISOString(), '2025-12-31T18:30:00.000Z');
assert.equal(range.endExclusive.toISOString(), '2026-01-02T18:30:00.000Z');

// Funnel counts use unique persisted lifecycle events and risk snapshots.
const funnel = calculation.funnel(
  [{ id: 'scan-1', isShortlisted: true }, { id: 'scan-2', isShortlisted: false }],
  [candidate('risk-1'), candidate('risk-2', { riskSnapshot: { accepted: false } })],
  [
    event('qualified', null, 'CANDIDATE_QUALIFIED', { candidateId: 'candidate-1' }),
    event('notified', null, 'CANDIDATE_NOTIFIED', { candidateId: 'candidate-1' }),
    ...decisions,
  ],
);
assert.deepEqual(funnel, {
  scanResults: 2,
  shortlisted: 1,
  riskApprovedCandidates: 1,
  qualifiedCandidates: 1,
  notifiedCandidates: 1,
  acceptedCandidates: 1,
  skippedCandidates: 1,
});

console.log('Analytics scenarios A-O passed.');
process.exit(0);
