import Decimal from 'decimal.js';
import { MARKET_REGIME_V1_CONFIG, MarketRegimeConfig } from '../config/market-regime-v1.config';
import { MarketRegimeInput } from '../models/market-regime-input.model';
import { MarketRegimeComponent, MarketRegimeComponents } from '../models/market-regime-components.model';
import { MarketRegime, RegimeConfidence } from '../models/market-regime.enum';
import { MarketRegimeResult } from '../models/market-regime-result.model';
import { calculateBreadthScore } from './breadth-score';
import { calculateMomentumScore } from './momentum-score';
import { MarketRegimeInputError, RegimeDecimal, decimal, formatScore } from './numeric';
import { calculateSectorParticipationScore } from './sector-participation-score';
import { calculateTrendScore } from './trend-score';
import { calculateVolatilityScore } from './volatility-score';

const ESSENTIAL_NIFTY_FIELDS = [
  'asOf', 'close', 'ema20', 'ema50', 'sma200', 'rsi14', 'roc20', 'roc50', 'normalizedAtr14',
] as const;

export function calculateMarketRegime(
  input: MarketRegimeInput, config: MarketRegimeConfig = MARKET_REGIME_V1_CONFIG,
): MarketRegimeResult {
  validateEssentialInput(input);
  const warnings = new Set(input.warnings ?? []);
  const usableVix = input.vixFreshness === 'CURRENT' && input.vixIndicators?.close !== null &&
    input.vixIndicators?.close !== undefined ? input.vixIndicators : undefined;
  if (!input.vixIndicators) warnings.add('INDIA_VIX_UNAVAILABLE');
  else if (input.vixFreshness !== 'CURRENT') warnings.add(`INDIA_VIX_NOT_CURRENT:${input.vixFreshness ?? 'UNKNOWN'}`);

  const trend = calculateTrendScore(input.niftyIndicators);
  const momentum = calculateMomentumScore(input.niftyIndicators, config);
  const volatility = calculateVolatilityScore(input.niftyIndicators, usableVix, config);
  const breadth = input.breadth ? calculateBreadthScore(input.breadth) : null;
  const sectorParticipation = input.sectorParticipation ?
    calculateSectorParticipationScore(input.sectorParticipation) : null;
  if (!breadth) warnings.add('BREADTH_UNAVAILABLE');
  else if (input.breadth!.totalExcluded) warnings.add(`BREADTH_EXCLUDED_INSTRUMENTS:${input.breadth!.totalExcluded}`);
  if (!sectorParticipation) warnings.add('SECTOR_PARTICIPATION_UNAVAILABLE');
  else if (input.sectorParticipation!.totalExcludedInstruments) {
    warnings.add(`SECTOR_PARTICIPATION_EXCLUDED_INSTRUMENTS:${input.sectorParticipation!.totalExcludedInstruments}`);
  }

  const components: MarketRegimeComponents = {
    trend, momentum, volatility,
    ...(breadth ? { breadth } : {}),
    ...(sectorParticipation ? { sectorParticipation } : {}),
  };
  const score = weightedScore(components, config);
  const regime = classify(score, components, config);
  const confidence = calculateConfidence(regime, score, components, usableVix !== undefined, config);
  return {
    regime, score: formatScore(score), confidence, version: config.version,
    marketDate: input.marketDate, calculatedAt: new Date(input.calculatedAt), components,
    reasons: componentReasons(components), warnings: [...warnings],
  };
}

function validateEssentialInput(input: MarketRegimeInput): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.marketDate) ||
      new Date(input.marketDate + 'T00:00:00.000Z').toISOString().slice(0, 10) !== input.marketDate) {
    throw new MarketRegimeInputError('marketDate must be a real YYYY-MM-DD date');
  }
  if (!(input.calculatedAt instanceof Date) || !Number.isFinite(input.calculatedAt.getTime())) {
    throw new MarketRegimeInputError('calculatedAt must be a valid Date');
  }
  if (input.niftyFreshness !== 'CURRENT') {
    throw new MarketRegimeInputError(`NIFTY 50 data is not current: ${input.niftyFreshness}`);
  }
  const missing = ESSENTIAL_NIFTY_FIELDS.filter(field => input.niftyIndicators[field] === null);
  if (missing.length) throw new MarketRegimeInputError(`NIFTY 50 indicators are incomplete: ${missing.join(', ')}`);
  const asOf = input.niftyIndicators.asOf!;
  if (!Number.isFinite(Date.parse(asOf)) || asOf.slice(0, 10) !== input.marketDate) {
    throw new MarketRegimeInputError('NIFTY 50 indicator date does not match marketDate');
  }
}

function weightedScore(components: MarketRegimeComponents, config: MarketRegimeConfig): Decimal {
  const entries: { component: MarketRegimeComponent; weight: string }[] = [
    { component: components.trend, weight: config.weights.trend },
    { component: components.momentum, weight: config.weights.momentum },
    { component: components.volatility, weight: config.weights.volatility },
  ];
  if (components.breadth) entries.push({ component: components.breadth, weight: config.weights.breadth });
  if (components.sectorParticipation) {
    entries.push({ component: components.sectorParticipation, weight: config.weights.sectorParticipation });
  }
  const totalWeight = entries.reduce((sum, entry) => sum.plus(entry.weight), new RegimeDecimal(0));
  return entries.reduce((sum, entry) =>
    sum.plus(decimal(entry.component.score, 'component score').times(entry.weight)), new RegimeDecimal(0)).div(totalWeight);
}

function classify(score: Decimal, components: MarketRegimeComponents, config: MarketRegimeConfig): MarketRegime {
  const participation = [components.breadth, components.sectorParticipation]
    .filter((component): component is MarketRegimeComponent => component !== undefined)
    .some(component => decimal(component.score, 'participation score')
      .lte(config.riskOffConfirmation.maximumParticipationScore));
  const confirmedRiskOff = score.lte(config.classification.riskOff) &&
    decimal(components.trend.score, 'trend score').lte(config.riskOffConfirmation.maximumTrendScore) &&
    decimal(components.volatility.score, 'volatility score').lte(config.riskOffConfirmation.maximumVolatilityScore) &&
    participation;
  if (confirmedRiskOff) return MarketRegime.RISK_OFF;
  if (score.gte(config.classification.bullish)) return MarketRegime.BULLISH;
  if (score.lte(config.classification.bearish)) return MarketRegime.BEARISH;
  return MarketRegime.NEUTRAL;
}

function calculateConfidence(
  regime: MarketRegime, _score: Decimal, components: MarketRegimeComponents,
  hasVix: boolean, config: MarketRegimeConfig,
): RegimeConfidence {
  const coverage = new RegimeDecimal(65).plus(hasVix ? 10 : 0)
    .plus(components.breadth ? 15 : 0).plus(components.sectorParticipation ? 10 : 0);
  const values = [components.trend, components.momentum, components.volatility,
    components.breadth, components.sectorParticipation]
    .filter((component): component is MarketRegimeComponent => component !== undefined)
    .map(component => decimal(component.score, 'component score'));
  const expectedDirection = regime === MarketRegime.BULLISH ? 1 :
    regime === MarketRegime.BEARISH || regime === MarketRegime.RISK_OFF ? -1 : 0;
  const agreeing = values.filter(value => expectedDirection > 0 ? value.gt(10) :
    expectedDirection < 0 ? value.lt(-10) : value.abs().lte(20)).length;
  const agreement = new RegimeDecimal(agreeing).div(values.length);
  if (coverage.gte(config.confidence.highCoverage) && agreement.gte(config.confidence.highAgreement)) {
    return RegimeConfidence.HIGH;
  }
  if (coverage.gte(config.confidence.mediumCoverage) && agreement.gte(config.confidence.mediumAgreement)) {
    return RegimeConfidence.MEDIUM;
  }
  return RegimeConfidence.LOW;
}

function componentReasons(components: MarketRegimeComponents): string[] {
  return [
    describe('NIFTY trend', components.trend.score),
    describe('NIFTY momentum', components.momentum.score),
    describe('volatility conditions', components.volatility.score, true),
    ...(components.breadth ? [describe('market breadth', components.breadth.score)] : []),
    ...(components.sectorParticipation ? [describe('sector participation', components.sectorParticipation.score)] : []),
  ];
}

function describe(label: string, value: string, risk = false): string {
  const score = decimal(value, `${label} score`);
  if (score.gte(50)) return `${label} ${risk ? 'are supportive' : 'is strongly positive'}`;
  if (score.gt(10)) return `${label} ${risk ? 'are normal' : 'is positive'}`;
  if (score.lte(-50)) return `${label} ${risk ? 'are materially elevated' : 'is strongly negative'}`;
  if (score.lt(-10)) return `${label} ${risk ? 'are elevated' : 'is negative'}`;
  return `${label} is mixed`;
}
