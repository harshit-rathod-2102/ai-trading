import { Injectable } from '@nestjs/common';
import { calculateRollingHigh, calculateRollingLow } from '../../indicators/calculations/rolling-range';
import { calculateVolumeRatio } from '../../indicators/calculations/volume';
import { TradingStrategy } from '../contracts/strategy.interface';
import { StrategyInput } from '../contracts/strategy-input.model';
import { StrategyResult } from '../contracts/strategy-result.model';
import { StrategyName } from '../models/strategy-name.enum';
import { Evaluation, evaluateSafely } from '../shared/evaluation';
import { closeLocation, momentum, regimeFit, relativeStrength, sectorStrength, trendQuality, volatility } from '../shared/features';
import { component, d, distancePercent, fixed, mean, scoreBand, scoreLinearRange } from '../shared/scoring';
import { MOMENTUM_BREAKOUT_V1_CONFIG as config } from './momentum-breakout-v1.config';

@Injectable()
export class MomentumBreakoutStrategy implements TradingStrategy {
  readonly name = StrategyName.MOMENTUM_BREAKOUT;
  readonly version = config.version;

  evaluate(input: StrategyInput): StrategyResult {
    const evaluation = new Evaluation(input, this.name, this.version, config);
    return evaluateSafely(evaluation, () => this.evaluateSetup(evaluation));
  }

  private evaluateSetup(e: Evaluation): StrategyResult {
    const { input } = e;
    const latest = input.candles.at(-1)!;
    const { close, ema20, ema50, sma200, atr14 } = input.indicators;
    // Current candle must not set its own breakout level or range width.
    const prior = input.candles.slice(0, -1);
    const priorHigh = calculateRollingHigh(prior, config.breakoutPeriod)!;
    const priorLow = calculateRollingLow(prior, config.breakoutPeriod)!;
    const longerHigh = calculateRollingHigh(prior, config.longerRangePeriod)!;
    const setupContext = { breakoutLevel: priorHigh, recentBaseLow: priorLow, prior50DayHigh: longerHigh };
    if (!d(close!).gt(ema50!) || !d(close!).gt(sma200!) || !d(ema50!).gt(sma200!)) {
      e.reject('TREND_NOT_ESTABLISHED', 'Breakout requires close above EMA50 and SMA200, and EMA50 above SMA200');
    }
    if (!d(close!).gt(priorHigh)) e.reject('NO_BREAKOUT', 'Latest close has not exceeded the prior 20-candle high');
    if (e.rejectionCodes.length) return e.finish({}, setupContext);

    const magnitude = distancePercent(close!, priorHigh);
    const baseWidth = distancePercent(priorHigh, priorLow);
    const location = closeLocation(latest);
    const volumeRatio = calculateVolumeRatio(input.candles, config.volumePeriod);
    // A zero-volume baseline has already failed the prior liquidity filter.
    if (volumeRatio === null) throw new Error('Validated breakout volume baseline unexpectedly unavailable');
    const ema20Distance = distancePercent(close!, ema20!);
    const ema50Distance = distancePercent(close!, ema50!);
    const atrDistance = d(close!).minus(ema20!).div(atr14!);
    const extension = mean([
      d(100).minus(scoreLinearRange(ema20Distance, ...config.extensionEma20Range)),
      d(100).minus(scoreLinearRange(ema50Distance, ...config.extensionEma50Range)),
      d(100).minus(scoreLinearRange(atrDistance, ...config.extensionAtrRange)),
      d(100).minus(scoreLinearRange(magnitude, config.breakoutMagnitudeBand[2], config.breakoutMagnitudeBand[3])),
    ]);
    const w = config.weights;
    const components = {
      trendQuality: trendQuality(input, w.trendQuality),
      relativeStrength: relativeStrength(e, w.relativeStrength),
      breakoutStructure: component(mean([
        scoreBand(magnitude, config.breakoutMagnitudeBand), location,
        d(100).minus(scoreLinearRange(baseWidth, ...config.baseWidthRange)),
      ]), w.breakoutStructure, { prior20DayHigh: priorHigh, prior50DayHigh: longerHigh,
        prior20DayLow: priorLow, close, breakoutPercent: fixed(magnitude),
        baseWidthPercent: fixed(baseWidth), closeLocationPercent: fixed(location), abovePrior50DayHigh: d(close!).gt(longerHigh) }),
      volumeConfirmation: component(scoreLinearRange(d(volumeRatio), ...config.volumeRatioRange), w.volumeConfirmation,
        { currentVolume: latest.volume, priorVolumeRatio: volumeRatio, priorBaselinePeriod: config.volumePeriod }),
      momentum: momentum(e, w.momentum),
      volatilityQuality: volatility(e, w.volatilityQuality),
      extensionRisk: component(extension, w.extensionRisk,
        { distanceFromEma20Percent: fixed(ema20Distance), distanceFromEma50Percent: fixed(ema50Distance),
          distanceFromEma20Atr: fixed(atrDistance), breakoutPercent: fixed(magnitude) }),
      marketRegimeFit: regimeFit(e, w.marketRegimeFit),
      sectorStrength: sectorStrength(e, w.sectorStrength),
    };
    e.reasons.push('Price closed above the prior 20-candle range high', 'Long-term uptrend and prior liquidity filters passed');
    if (d(volumeRatio).gt(1)) e.reasons.push('Volume expanded versus the prior 20-candle average');
    if (d(input.indicators.relativeStrength50!.excessReturnPercent).gt(0)) e.reasons.push('Stock outperformed NIFTY over 50 aligned observations');
    return e.finish(components, setupContext);
  }
}
