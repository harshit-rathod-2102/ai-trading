import { Injectable } from '@nestjs/common';
import { IndicatorCandle } from './models/indicator-candle.model';
import { TechnicalIndicatorSnapshot } from './models/technical-indicators.model';
import { calculateAtr, calculateNormalizedAtr } from './calculations/atr';
import { calculateEma } from './calculations/ema';
import { calculateRelativeStrength, alignCandleSeries } from './calculations/relative-strength';
import { calculateRoc } from './calculations/roc';
import { calculateRollingHigh, calculateRollingLow } from './calculations/rolling-range';
import { calculateRsi } from './calculations/rsi';
import { calculateSma } from './calculations/sma';
import { percentageDistance, positiveDecimal, nonNegativeDecimal } from './calculations/decimal';
import {
  calculateAverageTradedValue,
  calculateAverageVolume,
  calculateVolumeRatio,
} from './calculations/volume';

@Injectable()
export class IndicatorsService {
  calculateTechnicalSnapshot(
    stockCandles: readonly IndicatorCandle[],
    benchmarkCandles?: readonly IndicatorCandle[],
  ): TechnicalIndicatorSnapshot {
    this.validateSeries(stockCandles, 'stock');
    if (benchmarkCandles !== undefined) this.validateSeries(benchmarkCandles, 'benchmark');
    if (stockCandles.length === 0) return this.emptySnapshot();

    const closes = stockCandles.map((candle) => candle.close);
    const latest = stockCandles.at(-1)!;
    const sma20 = calculateSma(closes, 20);
    const sma50 = calculateSma(closes, 50);
    const sma200 = calculateSma(closes, 200);
    const ema20 = calculateEma(closes, 20);
    const ema50 = calculateEma(closes, 50);
    const atr14 = calculateAtr(stockCandles, 14);
    const rollingHigh20 = calculateRollingHigh(stockCandles, 20);
    const rollingLow20 = calculateRollingLow(stockCandles, 20);
    const aligned =
      benchmarkCandles === undefined ? null : alignCandleSeries(stockCandles, benchmarkCandles);

    return {
      asOf: latest.timestamp.toISOString(),
      close: latest.close,
      sma20,
      sma50,
      sma200,
      ema20,
      ema50,
      rsi14: calculateRsi(closes, 14),
      atr14,
      normalizedAtr14: calculateNormalizedAtr(atr14, latest.close),
      roc20: calculateRoc(closes, 20),
      roc50: calculateRoc(closes, 50),
      rollingHigh20,
      rollingLow20,
      rollingHigh50: calculateRollingHigh(stockCandles, 50),
      rollingLow50: calculateRollingLow(stockCandles, 50),
      distanceFromRollingHigh20Percent: percentageDistance(latest.close, rollingHigh20),
      distanceFromRollingLow20Percent: percentageDistance(latest.close, rollingLow20),
      volumeAverage20: calculateAverageVolume(stockCandles, 20),
      volumeRatio20: calculateVolumeRatio(stockCandles, 20),
      averageTradedValue20: calculateAverageTradedValue(stockCandles, 20),
      distanceFromEma20Percent: percentageDistance(latest.close, ema20),
      distanceFromEma50Percent: percentageDistance(latest.close, ema50),
      distanceFromSma200Percent: percentageDistance(latest.close, sma200),
      relativeStrength20: aligned === null ? null : calculateRelativeStrength(aligned, 20),
      relativeStrength50: aligned === null ? null : calculateRelativeStrength(aligned, 50),
      relativeStrength126: aligned === null ? null : calculateRelativeStrength(aligned, 126),
    };
  }

  private validateSeries(candles: readonly IndicatorCandle[], label: string): void {
    let priorTime = Number.NEGATIVE_INFINITY;
    let priorDate = '';
    candles.forEach((candle, index) => {
      if (!(candle.timestamp instanceof Date) || !Number.isFinite(candle.timestamp.getTime())) {
        throw new RangeError(`${label}[${index}] has an invalid timestamp`);
      }
      const time = candle.timestamp.getTime();
      const date = candle.timestamp.toISOString().slice(0, 10);
      if (time <= priorTime || date === priorDate) {
        throw new RangeError(`${label} candles must be unique and ordered oldest to newest`);
      }
      const open = positiveDecimal(candle.open, `${label}[${index}].open`);
      const high = positiveDecimal(candle.high, `${label}[${index}].high`);
      const low = positiveDecimal(candle.low, `${label}[${index}].low`);
      const close = positiveDecimal(candle.close, `${label}[${index}].close`);
      if (high.lt(open) || high.lt(low) || high.lt(close) || low.gt(open) || low.gt(close)) {
        throw new RangeError(`${label}[${index}] has inconsistent OHLC values`);
      }
      if (candle.volume !== null) nonNegativeDecimal(candle.volume, `${label}[${index}].volume`);
      priorTime = time;
      priorDate = date;
    });
  }

  private emptySnapshot(): TechnicalIndicatorSnapshot {
    return {
      asOf: null,
      close: null,
      sma20: null,
      sma50: null,
      sma200: null,
      ema20: null,
      ema50: null,
      rsi14: null,
      atr14: null,
      normalizedAtr14: null,
      roc20: null,
      roc50: null,
      rollingHigh20: null,
      rollingLow20: null,
      rollingHigh50: null,
      rollingLow50: null,
      distanceFromRollingHigh20Percent: null,
      distanceFromRollingLow20Percent: null,
      volumeAverage20: null,
      volumeRatio20: null,
      averageTradedValue20: null,
      distanceFromEma20Percent: null,
      distanceFromEma50Percent: null,
      distanceFromSma200Percent: null,
      relativeStrength20: null,
      relativeStrength50: null,
      relativeStrength126: null,
    };
  }
}
