import { Injectable } from '@nestjs/common';
import { calculateRollingHigh, calculateRollingLow } from '../../indicators/calculations/rolling-range';
import { calculateAverageVolume } from '../../indicators/calculations/volume';
import { TradingStrategy } from '../contracts/strategy.interface';
import { StrategyInput } from '../contracts/strategy-input.model';
import { StrategyResult } from '../contracts/strategy-result.model';
import { StrategyName } from '../models/strategy-name.enum';
import { Evaluation, evaluateSafely } from '../shared/evaluation';
import { closeLocation, momentum, regimeFit, relativeStrength, sectorStrength, trendQuality, volatility } from '../shared/features';
import { component, d, distancePercent, fixed, mean, scoreBand, scoreLinearRange } from '../shared/scoring';
import { TREND_PULLBACK_V1_CONFIG as config } from './trend-pullback-v1.config';

@Injectable()
export class TrendPullbackStrategy implements TradingStrategy {
  readonly name = StrategyName.TREND_PULLBACK;
  readonly version = config.version;

  evaluate(input: StrategyInput): StrategyResult {
    const evaluation = new Evaluation(input, this.name, this.version, config);
    return evaluateSafely(evaluation, () => this.evaluateSetup(evaluation));
  }

  private evaluateSetup(e: Evaluation): StrategyResult {
    const { input } = e;
    const latest = input.candles.at(-1)!;
    const previous = input.candles.at(-2)!;
    const prior = input.candles.slice(0, -1);
    const { close, ema20, ema50, sma200, atr14 } = input.indicators;
    const recentHigh = calculateRollingHigh(prior, config.recentHighPeriod)!;
    const depth = distancePercent(close!, recentHigh).negated();
    const recentSwingLow = calculateRollingLow(input.candles, config.swingLowPeriod)!;
    const distance20 = d(close!).minus(ema20!).abs().div(atr14!);
    const distance50 = d(close!).minus(ema50!).abs().div(atr14!);
    const supportLevel = distance20.lte(distance50) ? ema20! : ema50!;
    const supportDistance = distance20.lte(distance50) ? distance20 : distance50;
    const setupContext = { recentHigh, recentSwingLow, supportLevel,
      supportReference: distance20.lte(distance50) ? 'EMA20' : 'EMA50' };
    if (!d(close!).gt(sma200!) || !d(ema50!).gt(sma200!)) {
      e.reject('TREND_NOT_ESTABLISHED', 'Pullback requires close and EMA50 above SMA200');
    }
    if (depth.lt(config.minimumDepthPercent)) e.reject('PULLBACK_NOT_PRESENT', 'Retracement is smaller than the configured minimum');
    if (depth.gt(config.maximumDepthPercent)) e.reject('PULLBACK_TOO_DEEP', 'Retracement exceeds the configured maximum');
    if (e.rejectionCodes.length) return e.finish({}, setupContext);

    // Last three prior candles describe pullback participation, compared with a disjoint prior 20.
    const recentVolume = calculateAverageVolume(prior, config.contractionPeriod)!;
    const baselineVolume = calculateAverageVolume(prior.slice(0, -config.contractionPeriod), config.priorVolumePeriod)!;
    const contractionRatio = d(baselineVolume).isZero() ? null : d(recentVolume).div(baselineVolume);
    const recoveryVolume = d(previous.volume!).isZero() ? null : d(latest.volume!).div(previous.volume!);
    const recovery = distancePercent(close!, previous.close);
    const location = closeLocation(latest);
    const w = config.weights;
    const components = {
      primaryTrendQuality: trendQuality(input, w.primaryTrendQuality),
      pullbackDepth: component(scoreBand(depth, config.depthBand), w.pullbackDepth,
        { recentHigh, close, retracementPercent: fixed(depth) }),
      supportZoneQuality: component(d(100).minus(scoreLinearRange(supportDistance, ...config.supportDistanceAtrRange)),
        w.supportZoneQuality, { supportLevel, ema20, ema50, distanceToSupportAtr: fixed(supportDistance) }),
      relativeStrength: relativeStrength(e, w.relativeStrength),
      volumeContraction: component(contractionRatio === null ? d(0) :
        d(100).minus(scoreLinearRange(contractionRatio, ...config.contractionRatioRange)), w.volumeContraction,
      { recentAverageVolume: recentVolume, precedingAverageVolume: baselineVolume,
        contractionRatio: contractionRatio === null ? null : fixed(contractionRatio),
        recentPeriod: config.contractionPeriod, precedingPeriod: config.priorVolumePeriod }),
      renewedBuyingStrength: component(mean([scoreLinearRange(recovery, ...config.recoveryPercentRange), location,
        recoveryVolume === null ? d(0) : scoreLinearRange(recoveryVolume, ...config.recoveryVolumeRange)]),
      w.renewedBuyingStrength, { close, previousClose: previous.close, recoveryPercent: fixed(recovery),
        closeLocationPercent: fixed(location), volumeVsPrevious: recoveryVolume === null ? null : fixed(recoveryVolume) }),
      momentumHealth: momentum(e, w.momentumHealth),
      volatilityQuality: volatility(e, w.volatilityQuality),
      marketRegimeFit: regimeFit(e, w.marketRegimeFit),
      sectorStrength: sectorStrength(e, w.sectorStrength),
    };
    e.reasons.push('Long-term trend remains intact', 'Retracement lies within the configured pullback bounds');
    if (recovery.gt(0)) e.reasons.push('Latest close improved over the preceding candle');
    if (contractionRatio?.lt(1)) e.reasons.push('Recent pullback volume contracted versus its earlier baseline');
    return e.finish(components, setupContext);
  }
}
