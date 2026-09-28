import { IndicatorCandle } from '../models/indicator-candle.model';
import { RelativeStrengthResult } from '../models/relative-strength.model';
import { formatIndicator, periodIsValid, positiveDecimal } from './decimal';

export interface AlignedClose {
  readonly date: string;
  readonly stockClose: string;
  readonly benchmarkClose: string;
}

function tradingDate(timestamp: Date): string {
  if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) {
    throw new RangeError('candle timestamp must be a valid Date');
  }
  return timestamp.toISOString().slice(0, 10);
}

// Daily candles are aligned by UTC calendar date, never by array position.
export function alignCandleSeries(
  stockCandles: readonly IndicatorCandle[],
  benchmarkCandles: readonly IndicatorCandle[],
): AlignedClose[] {
  assertChronological(stockCandles, 'stock');
  assertChronological(benchmarkCandles, 'benchmark');
  const benchmark = new Map<string, string>();
  for (const candle of benchmarkCandles) {
    const date = tradingDate(candle.timestamp);
    if (benchmark.has(date)) throw new RangeError(`benchmark has duplicate date ${date}`);
    positiveDecimal(candle.close, `benchmark close on ${date}`);
    benchmark.set(date, candle.close);
  }
  const seen = new Set<string>();
  const aligned: AlignedClose[] = [];
  for (const candle of stockCandles) {
    const date = tradingDate(candle.timestamp);
    if (seen.has(date)) throw new RangeError(`stock has duplicate date ${date}`);
    seen.add(date);
    positiveDecimal(candle.close, `stock close on ${date}`);
    const benchmarkClose = benchmark.get(date);
    if (benchmarkClose !== undefined)
      aligned.push({ date, stockClose: candle.close, benchmarkClose });
  }
  return aligned;
}

function assertChronological(candles: readonly IndicatorCandle[], label: string): void {
  let prior = Number.NEGATIVE_INFINITY;
  for (const candle of candles) {
    const timestamp = candle.timestamp;
    const current = timestamp instanceof Date ? timestamp.getTime() : Number.NaN;
    if (!Number.isFinite(current) || current <= prior) {
      throw new RangeError(`${label} candles must be ordered oldest to newest`);
    }
    prior = current;
  }
}

export function calculateRelativeStrength(
  aligned: readonly AlignedClose[],
  period: number,
): RelativeStrengthResult | null {
  periodIsValid(period);
  let priorDate = '';
  for (const row of aligned) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.date <= priorDate) {
      throw new RangeError('aligned closes must have unique dates ordered oldest to newest');
    }
    positiveDecimal(row.stockClose, `stock close on ${row.date}`);
    positiveDecimal(row.benchmarkClose, `benchmark close on ${row.date}`);
    priorDate = row.date;
  }
  if (aligned.length < period + 1) return null;
  const current = aligned.at(-1)!;
  const past = aligned[aligned.length - period - 1];
  const stockNow = positiveDecimal(current.stockClose, 'current stock close');
  const stockPast = positiveDecimal(past.stockClose, 'past stock close');
  const benchmarkNow = positiveDecimal(current.benchmarkClose, 'current benchmark close');
  const benchmarkPast = positiveDecimal(past.benchmarkClose, 'past benchmark close');
  const stockReturn = stockNow.div(stockPast).minus(1);
  const benchmarkReturn = benchmarkNow.div(benchmarkPast).minus(1);
  const currentRatio = stockNow.div(benchmarkNow);
  const pastRatio = stockPast.div(benchmarkPast);
  return {
    period,
    stockReturnPercent: formatIndicator(stockReturn.times(100)),
    benchmarkReturnPercent: formatIndicator(benchmarkReturn.times(100)),
    excessReturnPercent: formatIndicator(stockReturn.minus(benchmarkReturn).times(100)),
    currentPriceRatio: formatIndicator(currentRatio),
    priceRatioChangePercent: formatIndicator(currentRatio.div(pastRatio).minus(1).times(100)),
  };
}
