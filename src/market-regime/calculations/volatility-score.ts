import Decimal from 'decimal.js';
import { TechnicalIndicatorSnapshot } from '../../indicators/models/technical-indicators.model';
import { MarketRegimeConfig } from '../config/market-regime-v1.config';
import { MarketRegimeComponent } from '../models/market-regime-components.model';
import { RegimeDecimal, average, decimal, formatScore } from './numeric';

function vixScore(value: Decimal, config: MarketRegimeConfig): Decimal {
  if (value.lte(config.volatility.vixNormalMaximum)) return new RegimeDecimal(75);
  if (value.lte(config.volatility.vixElevatedMaximum)) return new RegimeDecimal(-25);
  if (value.lte(config.volatility.vixHighMaximum)) return new RegimeDecimal(-65);
  return new RegimeDecimal(-100);
}

function normalizedAtrScore(value: Decimal, config: MarketRegimeConfig): Decimal {
  if (value.lte(config.volatility.normalizedAtrNormalMaximum)) return new RegimeDecimal(50);
  if (value.lte(config.volatility.normalizedAtrElevatedMaximum)) return new RegimeDecimal(-20);
  if (value.lte(config.volatility.normalizedAtrHighMaximum)) return new RegimeDecimal(-60);
  return new RegimeDecimal(-100);
}

export function calculateVolatilityScore(
  niftyIndicators: TechnicalIndicatorSnapshot,
  vixIndicators: TechnicalIndicatorSnapshot | undefined,
  config: MarketRegimeConfig,
): MarketRegimeComponent {
  const normalizedAtr = decimal(niftyIndicators.normalizedAtr14!, 'NIFTY normalized ATR14');
  if (normalizedAtr.lt(0)) throw new RangeError('NIFTY normalized ATR14 must not be negative');
  const scores = [normalizedAtrScore(normalizedAtr, config)];
  if (vixIndicators?.close !== null && vixIndicators?.close !== undefined) {
    const close = decimal(vixIndicators.close, 'India VIX close');
    if (close.lte(0)) throw new RangeError('India VIX close must be positive');
    scores.push(vixScore(close, config));
  }
  return { score: formatScore(average(scores)), evidence: {
    niftyNormalizedAtr14: niftyIndicators.normalizedAtr14,
    indiaVixClose: vixIndicators?.close ?? null,
    vixAvailable: vixIndicators?.close !== null && vixIndicators?.close !== undefined,
  } };
}
