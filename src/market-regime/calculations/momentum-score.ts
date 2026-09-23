import Decimal from 'decimal.js';
import { TechnicalIndicatorSnapshot } from '../../indicators/models/technical-indicators.model';
import { MarketRegimeConfig } from '../config/market-regime-v1.config';
import { MarketRegimeComponent } from '../models/market-regime-components.model';
import { RegimeDecimal, average, decimal, formatScore } from './numeric';

function rsiScore(value: Decimal, config: MarketRegimeConfig): Decimal {
  if (value.gte(config.momentum.rsiStrongPositive)) return new RegimeDecimal(100);
  if (value.gte(config.momentum.rsiPositive)) return new RegimeDecimal(50);
  if (value.lte(config.momentum.rsiStrongNegative)) return new RegimeDecimal(-100);
  if (value.lte(config.momentum.rsiNegative)) return new RegimeDecimal(-50);
  return new RegimeDecimal(0);
}

function rocScore(value: Decimal, strongMagnitude: string): Decimal {
  if (value.gte(strongMagnitude)) return new RegimeDecimal(100);
  if (value.gt(0)) return new RegimeDecimal(50);
  if (value.lte(new RegimeDecimal(strongMagnitude).negated())) return new RegimeDecimal(-100);
  if (value.lt(0)) return new RegimeDecimal(-50);
  return new RegimeDecimal(0);
}

export function calculateMomentumScore(
  indicators: TechnicalIndicatorSnapshot,
  config: MarketRegimeConfig,
): MarketRegimeComponent {
  const rsi14 = decimal(indicators.rsi14!, 'NIFTY RSI14');
  const roc20 = decimal(indicators.roc20!, 'NIFTY ROC20');
  const roc50 = decimal(indicators.roc50!, 'NIFTY ROC50');
  if (rsi14.lt(0) || rsi14.gt(100)) throw new RangeError('NIFTY RSI14 must be between 0 and 100');
  const scores = [
    rsiScore(rsi14, config),
    rocScore(roc20, config.momentum.roc20StrongMagnitude),
    rocScore(roc50, config.momentum.roc50StrongMagnitude),
  ];
  return {
    score: formatScore(average(scores)),
    evidence: {
      rsi14: indicators.rsi14,
      roc20: indicators.roc20,
      roc50: indicators.roc50,
    },
  };
}
