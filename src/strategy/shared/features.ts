import Decimal from 'decimal.js';
import { IndicatorCandle } from '../../indicators/models/indicator-candle.model';
import { StrategyInput } from '../contracts/strategy-input.model';
import { StrategyScoreComponent } from '../models/strategy-score-component.model';
import { Evaluation } from './evaluation';
import { component, d, distancePercent, fixed, mean, scoreBand, scoreLinearRange } from './scoring';

export function trendQuality(input: StrategyInput, weight: string): StrategyScoreComponent {
  const { close, ema20, ema50, sma200 } = input.indicators;
  const pairs = [[close!, ema20!], [close!, ema50!], [close!, sma200!], [ema20!, ema50!], [ema50!, sma200!]];
  const score = mean(pairs.map(([left, right]) => d(left).gt(right) ? d(100) : d(left).eq(right) ? d(50) : d(0)));
  return component(score, weight, { close, ema20, ema50, sma200,
    distanceFromEma20Percent: fixed(distancePercent(close!, ema20!)),
    distanceFromEma50Percent: fixed(distancePercent(close!, ema50!)) });
}

export function relativeStrength(e: Evaluation, weight: string): StrategyScoreComponent {
  const { relativeStrength20: rs20, relativeStrength50: rs50, relativeStrength126: rs126 } = e.input.indicators;
  const values = [rs20!, rs50!, ...(rs126 ? [rs126] : [])];
  return component(mean(values.map(rs => scoreLinearRange(d(rs.excessReturnPercent), ...e.config.relativeStrengthRange))), weight,
    { excessReturn20Percent: rs20!.excessReturnPercent, excessReturn50Percent: rs50!.excessReturnPercent,
      excessReturn126Percent: rs126?.excessReturnPercent ?? null });
}

export function momentum(e: Evaluation, weight: string): StrategyScoreComponent {
  const { rsi14, roc20, roc50 } = e.input.indicators;
  return component(mean([scoreBand(d(rsi14!), e.config.rsiBand),
    scoreLinearRange(d(roc20!), ...e.config.roc20Range), scoreLinearRange(d(roc50!), ...e.config.roc50Range)]),
  weight, { rsi14, roc20, roc50 });
}

export function volatility(e: Evaluation, weight: string): StrategyScoreComponent {
  const { normalizedAtr14, atr14 } = e.input.indicators;
  return component(scoreBand(d(normalizedAtr14!), e.config.normalizedAtrBand), weight, { normalizedAtr14, atr14 });
}

export function regimeFit(e: Evaluation, weight: string): StrategyScoreComponent {
  return component(d(e.config.regimeScores[e.input.marketRegime.regime]), weight,
    { regime: e.input.marketRegime.regime, version: e.input.marketRegime.version, confidence: e.input.marketRegime.confidence });
}

export function sectorStrength(e: Evaluation, weight: string): StrategyScoreComponent {
  return component(d(e.sectorScore), weight, { sector: e.input.instrument.sector ?? null,
    suppliedStrength: e.input.sectorContext?.strengthScore ?? null,
    usable: !e.warningCodes.includes('SECTOR_CONTEXT_INVALID') && !e.warningCodes.includes('SECTOR_CONTEXT_UNAVAILABLE') });
}

/** Flat candles have no evidence of an upper-range close; return neutral location. */
export function closeLocation(candle: IndicatorCandle): Decimal {
  const range = d(candle.high).minus(candle.low);
  return range.isZero() ? d(50) : d(candle.close).minus(candle.low).div(range).times(100);
}
