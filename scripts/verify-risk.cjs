// Pure deterministic RiskModule verification; no database, provider, or Redis required.
const assert = require('node:assert/strict');
const Decimal = require('decimal.js');
const { RiskCalculatorService } = require('../dist/risk/risk-calculator.service');

const calculator = new RiskCalculatorService();
const evaluatedAt = new Date('2026-09-14T12:00:00.000Z');
function profile(patch = {}) {
  return { id: 'profile-1', name: 'Verification', currency: 'INR', accountCapital: '500000.0000',
    riskPerTradePercent: '0.5000', maxPositionPercent: '20.0000',
    maxOpenPortfolioRiskPercent: '2.5000', maxSectorExposurePercent: '30.0000',
    minimumRiskRewardRatio: '2.0000', maxOpenTrades: 6, isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-09-01T00:00:00.000Z'), ...patch };
}
function technical(close = '820.0000', atr14 = '5.0000') {
  return { asOf: '2026-09-14T00:00:00.000Z', close, atr14,
    sma20: null, sma50: null, sma200: null, ema20: '810.0000', ema50: null,
    rsi14: null, normalizedAtr14: null, roc20: null, roc50: null,
    rollingHigh20: null, rollingLow20: null, rollingHigh50: null, rollingLow50: null,
    distanceFromRollingHigh20Percent: null, distanceFromRollingLow20Percent: null,
    volumeAverage20: null, volumeRatio20: null, averageTradedValue20: '100000000.0000',
    distanceFromEma20Percent: null, distanceFromEma50Percent: null,
    distanceFromSma200Percent: null, relativeStrength20: null, relativeStrength50: null, relativeStrength126: null };
}
function setup(patch = {}) {
  const strategy = patch.strategy || 'MOMENTUM_BREAKOUT';
  const strategyVersion = strategy === 'MOMENTUM_BREAKOUT' ? 'momentum-breakout-v1' : 'trend-pullback-v1';
  const setupContext = strategy === 'MOMENTUM_BREAKOUT'
    ? { breakoutLevel: '819.0000', recentBaseLow: '795.0000', prior50DayHigh: '800.0000' }
    : { recentHigh: '830.0000', recentSwingLow: '795.0000', supportLevel: '810.0000', supportReference: 'EMA20' };
  return { scanResultId: 'scan-result-1', instrumentId: 'instrument-1', symbol: 'VERIFY', exchange: 'NSE',
    sector: 'Technology', strategy, strategyVersion, strategyScore: '90.0000', rankingScore: '88.0000',
    strategyRank: 1, globalRank: 1, technicalSnapshot: technical(),
    strategyResult: { strategy, strategyVersion, qualified: true, score: '90.0000',
      qualificationThreshold: '70.0000', components: {}, reasons: [], rejectionCodes: [],
      rejectionReasons: [], warningCodes: [], warnings: [], setupContext, inputEvidence: {}, evaluatedAt },
    ...patch };
}
function openTrade(patch = {}) {
  return { tradeId: 'trade-1', symbol: 'OPEN', sector: 'Other', quantity: 10,
    actualEntry: '100.0000', currentPrice: '100.0000', currentStop: '95.0000',
    currentPositionValue: null, isPartiallyClosed: false, ...patch };
}
function calculate({ setupValue = setup(), profileValue = profile(), openTrades = [] } = {}) {
  return calculator.calculate({ setup: setupValue, tradingProfile: profileValue, openTrades, evaluatedAt });
}
function has(result, code) { assert.ok(result.rejectionCodes.includes(code), JSON.stringify(result)); }

function main() {
  // A: standard 500k / 0.5% plan, entry 820 and structural stop 795.
  const normal = calculate();
  assert.equal(normal.accepted, true);
  assert.equal(normal.proposedEntry, '820.0000');
  assert.equal(normal.structuralStop, '795.0000');
  assert.equal(normal.riskBudget, '2500.0000');
  assert.equal(normal.riskPerShare, '25.0000');
  assert.equal(normal.quantityByRisk, 100);
  assert.equal(normal.quantityByPositionCap, 121);
  assert.equal(normal.recommendedQuantity, 100);
  assert.equal(normal.capitalRequired, '82000.0000');
  assert.equal(normal.plannedLossAtStop, '2500.0000');
  assert.equal(normal.target1, '870.0000');
  assert.equal(normal.target2, '895.0000');
  assert.equal(normal.rewardRiskToTarget1, '2.0000');

  // B: a 5-point stop raises risk sizing to 500, while position value caps it at 121.
  const tightSetup = setup();
  tightSetup.strategyResult.setupContext.recentBaseLow = '815.0000';
  tightSetup.technicalSnapshot = technical('820.0000', '10.0000');
  const tight = calculate({ setupValue: tightSetup });
  assert.equal(tight.accepted, true);
  assert.equal(tight.quantityByRisk, 500);
  assert.equal(tight.quantityByPositionCap, 121);
  assert.equal(tight.recommendedQuantity, 121);

  // C: wide structural risk lowers quantity and fails the configured 5 ATR bound.
  const wideSetup = setup();
  wideSetup.strategyResult.setupContext.recentBaseLow = '760.0000';
  wideSetup.technicalSnapshot = technical('820.0000', '10.0000');
  const wide = calculate({ setupValue: wideSetup });
  assert.equal(wide.quantityByRisk, 41);
  assert.equal(wide.recommendedQuantity, 0);
  has(wide, 'STOP_TOO_WIDE');

  // D: a structural stop at or above entry is explicitly rejected.
  const invalidStopSetup = setup();
  invalidStopSetup.strategyResult.setupContext.recentBaseLow = '830.0000';
  const invalidStop = calculate({ setupValue: invalidStopSetup });
  assert.equal(invalidStop.accepted, false);
  has(invalidStop, 'INVALID_STOP');

  // E: only 500 portfolio-risk capacity remains, reducing the new plan to 20 shares.
  const nearRisk = calculate({ openTrades: [openTrade({ quantity: 1200, currentStop: '90.0000' })] });
  assert.equal(nearRisk.portfolioRiskBefore, '12000.0000');
  assert.equal(nearRisk.quantityByPortfolioRisk, 20);
  assert.equal(nearRisk.recommendedQuantity, 20);
  assert.equal(nearRisk.portfolioRiskAfter, '12500.0000');

  // F: reaching max concurrent trades is a hard rejection.
  const maxTrades = calculate({ openTrades: Array.from({ length: 6 }, (_, index) =>
    openTrade({ tradeId: `trade-${index}`, quantity: 1 })) });
  has(maxTrades, 'MAX_OPEN_TRADES_REACHED');
  assert.equal(maxTrades.recommendedQuantity, 0);

  // G: 145k Technology exposure leaves 5k capacity and a six-share sector cap.
  const sectorLimited = calculate({ openTrades: [openTrade({ sector: 'Technology', quantity: 1000,
    actualEntry: '145.0000', currentPrice: '145.0000', currentStop: '144.0000' })] });
  assert.equal(sectorLimited.sectorExposureBefore, '145000.0000');
  assert.equal(sectorLimited.quantityBySectorExposure, 6);
  assert.equal(sectorLimited.recommendedQuantity, 6);

  // H: missing setup sector skips only that cap and emits explicit evidence.
  const noSector = calculate({ setupValue: setup({ sector: null }) });
  assert.equal(noSector.accepted, true);
  assert.equal(noSector.quantityBySectorExposure, null);
  assert.ok(noSector.warningCodes.includes('SECTOR_METADATA_MISSING'));

  // I: a nearby prior high provides only 0.4R and fails the profile minimum.
  const poorReward = calculate({ setupValue: setup({ strategy: 'TREND_PULLBACK' }) });
  assert.equal(poorReward.rewardRiskToTarget1, '0.4000');
  has(poorReward, 'MINIMUM_RR_NOT_MET');
  assert.equal(poorReward.snapshot.target1Method, 'STRUCTURAL_TARGET');

  // J: absence of an active profile returns a typed result and no fabricated defaults.
  const noProfile = calculate({ profileValue: null });
  has(noProfile, 'NO_ACTIVE_TRADING_PROFILE');
  assert.equal(noProfile.riskBudget, null);

  // Missing prices and partial quantities use the documented conservative view and warn.
  const warnings = calculate({ openTrades: [openTrade({ sector: null, currentPrice: null,
    isPartiallyClosed: true })] });
  assert.ok(warnings.warningCodes.includes('PORTFOLIO_PRICE_DATA_STALE'));
  assert.ok(warnings.warningCodes.includes('OPEN_TRADE_SECTOR_UNAVAILABLE'));
  assert.ok(warnings.warningCodes.includes('PARTIAL_QUANTITY_UNAVAILABLE'));

  // Identical immutable inputs remain identical even when global Decimal precision changes.
  const baseline = calculate();
  for (let index = 0; index < 5; index++) assert.deepEqual(calculate(), baseline);
  Decimal.set({ precision: 6 });
  assert.deepEqual(calculate(), baseline);
  Decimal.set({ precision: 20 });
  console.log('PASS A-E: normal/tight/wide/invalid geometry and portfolio-risk sizing.');
  console.log('PASS F-J: open-trade, sector, missing metadata, minimum R:R, and no-profile controls.');
  console.log('PASS: audit snapshot, warnings, exact decimals, invariants, and deterministic repetition.');
}

main();
