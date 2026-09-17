import { TechnicalIndicatorSnapshot } from '../../indicators/models/technical-indicators.model';
import { MarketRegimeComponent } from '../models/market-regime-components.model';
import { RegimeDecimal, decimal, formatScore } from './numeric';

export function calculateTrendScore(indicators: TechnicalIndicatorSnapshot): MarketRegimeComponent {
  const close = decimal(indicators.close!, 'NIFTY close');
  const ema20 = decimal(indicators.ema20!, 'NIFTY EMA20');
  const ema50 = decimal(indicators.ema50!, 'NIFTY EMA50');
  const sma200 = decimal(indicators.sma200!, 'NIFTY SMA200');
  if ([close, ema20, ema50, sma200].some(value => value.lte(0))) {
    throw new RangeError('NIFTY trend prices and averages must be positive');
  }
  const evidence = {
    closeAboveEma20: close.gt(ema20), closeAboveEma50: close.gt(ema50),
    closeAboveSma200: close.gt(sma200), ema20AboveEma50: ema20.gt(ema50),
    ema50AboveSma200: ema50.gt(sma200), close: indicators.close,
    ema20: indicators.ema20, ema50: indicators.ema50, sma200: indicators.sma200,
  };
  const comparisons = [[close, ema20], [close, ema50], [close, sma200],
    [ema20, ema50], [ema50, sma200]] as const;
  const score = comparisons.reduce((sum, [left, right]) =>
    sum.plus(left.comparedTo(right) * 20), new RegimeDecimal(0));
  return { score: formatScore(score), evidence };
}
