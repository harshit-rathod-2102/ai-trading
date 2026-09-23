import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { TradeCandidate } from '../candidates/entities/trade-candidate.entity';
import { TradeEventType } from '../common/enums/trade-event-type.enum';
import { TradeEvent } from '../journal/entities/trade-event.entity';
import { ScanResultRecord } from '../scanner/entities/scan-result.entity';
import { Trade } from '../trades/entities/trade.entity';
import { ANALYTICS_V1_CONFIG, AnalyticsScoreBucketDefinition } from './config/analytics-v1.config';
import { AcceptedVsSkipped } from './models/accepted-vs-skipped.model';
import { AnalyticsCoverage, PerformanceMetrics } from './models/analytics-overview.model';
import { CandidateFunnel } from './models/candidate-funnel.model';
import { RegimePerformance } from './models/regime-performance.model';
import { ScoreBucketPerformance } from './models/score-bucket-performance.model';
import { SectorPerformance } from './models/sector-performance.model';
import { StrategyPerformance } from './models/strategy-performance.model';
import { TradePerformanceRecord } from './models/trade-performance-record.model';

const ZERO = new Decimal(0);

@Injectable()
export class AnalyticsCalculationService {
  normalizeTrades(
    trades: readonly Trade[],
    events: readonly TradeEvent[],
  ): TradePerformanceRecord[] {
    const byTrade = new Map<string, TradeEvent[]>();
    for (const event of events) {
      if (!event.tradeId) continue;
      const rows = byTrade.get(event.tradeId) ?? [];
      rows.push(event);
      byTrade.set(event.tradeId, rows);
    }
    return trades.map((trade) => this.normalizeTrade(trade, byTrade.get(trade.id) ?? []));
  }

  summarize(records: readonly TradePerformanceRecord[]): PerformanceMetrics {
    const pnl = records.map((record) => requiredDecimal(record.realizedPnl, 'realized P&L'));
    const wins = pnl.filter((value) => value.gt(0));
    const losses = pnl.filter((value) => value.lt(0));
    const breakeven = pnl.length - wins.length - losses.length;
    const grossProfit = sum(wins);
    const lossTotal = sum(losses);
    const grossLoss = lossTotal.abs();
    const rValues = records.flatMap((record) => decimalValues(record.realizedR));
    const mfeValues = records.flatMap((record) => decimalValues(record.mfeR));
    const maeValues = records.flatMap((record) => decimalValues(record.maeR));
    const holdingHours = records.map((record) => new Decimal(record.holdingMinutes).div(60));
    const directionalTrades = wins.length + losses.length;
    const bothExcursions = records.filter(
      (record) => record.mfeR !== null && record.maeR !== null,
    ).length;
    return {
      totalClosedTrades: records.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      breakevenTrades: breakeven,
      winRate: directionalTrades ? fixed(new Decimal(wins.length).div(directionalTrades)) : null,
      grossProfit: fixed(grossProfit),
      grossLoss: fixed(grossLoss),
      netRealizedPnl: fixed(sum(pnl)),
      averageWinner: wins.length ? fixed(grossProfit.div(wins.length)) : null,
      averageLoser: losses.length ? fixed(lossTotal.div(losses.length)) : null,
      profitFactor: grossLoss.gt(0) ? fixed(grossProfit.div(grossLoss)) : null,
      rSampleSize: rValues.length,
      expectancyR: average(rValues),
      averageR: average(rValues),
      medianR: median(rValues),
      maxDrawdown: fixed(maxDrawdown(records)),
      maxDrawdownPercent: null,
      averageHoldingHours: average(holdingHours),
      medianHoldingHours: median(holdingHours),
      averageMfeR: average(mfeValues),
      medianMfeR: median(mfeValues),
      averageMaeR: average(maeValues),
      medianMaeR: median(maeValues),
      mfeMaeSampleSize: bothExcursions,
    };
  }

  coverage(records: readonly TradePerformanceRecord[]): AnalyticsCoverage {
    return {
      closedTrades: records.length,
      tradesWithValidR: records.filter((record) => record.realizedR !== null).length,
      tradesWithMfeMae: records.filter((record) => record.mfeR !== null && record.maeR !== null)
        .length,
      tradesWithMfe: records.filter((record) => record.mfeR !== null).length,
      tradesWithMae: records.filter((record) => record.maeR !== null).length,
      tradesWithSector: records.filter((record) => Boolean(record.sector)).length,
      tradesWithRegime: records.filter((record) => Boolean(record.marketRegime)).length,
      tradesWithQuantScore: records.filter((record) => record.quantScore !== null).length,
      tradesWithRank: records.filter((record) => record.globalRank !== null).length,
      tradesWithExitEvents: records.filter((record) => record.realizedPnlSource === 'EXIT_EVENTS')
        .length,
      tradesUsingPersistedPnlFallback: records.filter(
        (record) => record.realizedPnlSource === 'TRADE_RECORD',
      ).length,
      invalidRiskTrades: records.filter((record) => record.realizedR === null).length,
    };
  }

  byStrategy(records: readonly TradePerformanceRecord[]): StrategyPerformance[] {
    return groups(records, (record) => `${record.strategy}\u0000${record.strategyVersion}`).map(
      ([key, values]) => {
        const [strategy, strategyVersion] = key.split('\u0000');
        return { strategy, strategyVersion, performance: this.summarize(values) };
      },
    );
  }

  byRegime(records: readonly TradePerformanceRecord[]): RegimePerformance[] {
    return groups(records, (record) => record.marketRegime ?? ANALYTICS_V1_CONFIG.unknownGroup).map(
      ([regime, values]) => ({ regime, performance: this.summarize(values) }),
    );
  }

  bySector(records: readonly TradePerformanceRecord[]): SectorPerformance[] {
    return groups(records, (record) => record.sector ?? ANALYTICS_V1_CONFIG.unknownGroup).map(
      ([sector, values]) => ({ sector, performance: this.summarize(values) }),
    );
  }

  byScoreBucket(
    candidates: readonly TradeCandidate[],
    records: readonly TradePerformanceRecord[],
  ): ScoreBucketPerformance[] {
    const definitions = [
      ...ANALYTICS_V1_CONFIG.scoreBuckets,
      ANALYTICS_V1_CONFIG.unknownScoreBucket,
    ];
    return definitions.map((definition) => {
      const candidateCount = candidates.filter(
        (candidate) => scoreBucket(candidate.quantScore).key === definition.key,
      ).length;
      const bucketRecords = records.filter(
        (record) => scoreBucket(record.quantScore).key === definition.key,
      );
      return {
        ...definition,
        candidateCount,
        closedTradeCount: bucketRecords.length,
        performance: this.summarize(bucketRecords),
      };
    });
  }

  acceptedVsSkipped(
    records: readonly TradePerformanceRecord[],
    events: readonly TradeEvent[],
  ): AcceptedVsSkipped {
    const acceptedIds = candidateIds(events, TradeEventType.TRADE_OPENED);
    const skippedIds = candidateIds(events, TradeEventType.CANDIDATE_SKIPPED);
    const acceptedRecords = records.filter(
      (record) => record.candidateId !== null && acceptedIds.has(record.candidateId),
    );
    const performance = this.summarize(acceptedRecords);
    return {
      acceptedCount: acceptedIds.size,
      skippedCount: skippedIds.size,
      acceptedClosedTrades: acceptedRecords.length,
      acceptedNetPnl: performance.netRealizedPnl,
      acceptedAverageR: performance.averageR,
      acceptedWinRate: performance.winRate,
      skippedOutcomeAvailable: false,
    };
  }

  funnel(
    scanResults: readonly ScanResultRecord[],
    candidates: readonly TradeCandidate[],
    events: readonly TradeEvent[],
  ): CandidateFunnel {
    return {
      scanResults: scanResults.length,
      shortlisted: scanResults.filter((result) => result.isShortlisted).length,
      riskApprovedCandidates: candidates.filter(
        (candidate) => record(candidate.riskSnapshot)?.accepted === true,
      ).length,
      qualifiedCandidates: candidateIds(events, TradeEventType.CANDIDATE_QUALIFIED).size,
      notifiedCandidates: candidateIds(events, TradeEventType.CANDIDATE_NOTIFIED).size,
      acceptedCandidates: candidateIds(events, TradeEventType.TRADE_OPENED).size,
      skippedCandidates: candidateIds(events, TradeEventType.CANDIDATE_SKIPPED).size,
    };
  }

  private normalizeTrade(trade: Trade, events: readonly TradeEvent[]): TradePerformanceRecord {
    if (!trade.closedAt) throw new Error(`Closed trade ${trade.id} has no closedAt timestamp`);
    const warnings: string[] = [];
    const opened = events.find((event) => event.eventType === TradeEventType.TRADE_OPENED);
    const initialQuantity = opened?.quantity ?? trade.quantity;
    const riskPerShare = positiveDifference(trade.actualEntry, trade.initialStop);
    let riskAmount = positiveDecimal(trade.initialRiskAmount);
    if (!riskAmount && riskPerShare && initialQuantity > 0) {
      riskAmount = riskPerShare.times(initialQuantity);
      warnings.push(
        'Initial risk amount was derived from entry, initial stop, and initial quantity.',
      );
    }
    if (!riskAmount)
      warnings.push('Initial risk is invalid; this trade is excluded from R metrics.');
    const pnlResult = realizedPnl(trade, events, warnings);
    const candidate = trade.candidate;
    const realizedR = riskAmount ? pnlResult.value.div(riskAmount) : null;
    const holdingMinutes = Math.max(
      0,
      (trade.closedAt.getTime() - trade.entryDecisionAt.getTime()) / 60_000,
    );
    return {
      tradeId: trade.id,
      candidateId: trade.candidateId ?? null,
      symbol: trade.symbol,
      sector: nonEmptyText(candidate?.sector),
      strategy: trade.strategy,
      strategyVersion: trade.strategyVersion,
      marketRegime: nonEmptyText(record(candidate?.marketRegimeSnapshot)?.regime),
      openedAt: trade.entryDecisionAt,
      closedAt: trade.closedAt,
      initialQuantity,
      entryPrice: fixed(requiredDecimal(trade.actualEntry, 'entry price')),
      initialStop: fixed(requiredDecimal(trade.initialStop, 'initial stop')),
      initialRiskPerShare: riskPerShare ? fixed(riskPerShare) : null,
      initialRiskAmount: riskAmount ? fixed(riskAmount) : null,
      realizedPnl: fixed(pnlResult.value),
      realizedPnlSource: pnlResult.source,
      realizedR: realizedR ? fixed(realizedR) : null,
      mfeR: optionalDecimalText(trade.maxFavorableR),
      maeR: optionalDecimalText(trade.maxAdverseR),
      holdingMinutes,
      quantScore: optionalDecimalText(candidate?.quantScore),
      globalRank: positiveInteger(candidate?.globalRank),
      strategyRank: positiveInteger(candidate?.strategyRank),
      warnings,
    };
  }
}

function realizedPnl(
  trade: Trade,
  events: readonly TradeEvent[],
  warnings: string[],
): { readonly value: Decimal; readonly source: 'EXIT_EVENTS' | 'TRADE_RECORD' } {
  const exits = events.filter((event) => event.eventType === TradeEventType.TRADE_CLOSED);
  if (exits.length) {
    const portions = exits.map((event) => exitPnl(event, trade.actualEntry));
    if (portions.every((value): value is Decimal => value !== null)) {
      return { value: sum(portions), source: 'EXIT_EVENTS' };
    }
    warnings.push('One or more exit events were incomplete; persisted trade P&L was used.');
  } else {
    warnings.push('No exit events were available; persisted trade P&L was used.');
  }
  return {
    value: requiredDecimal(trade.realizedPnl, `persisted P&L for trade ${trade.id}`),
    source: 'TRADE_RECORD',
  };
}

function exitPnl(event: TradeEvent, entryPrice: string): Decimal | null {
  if (event.price !== null && event.quantity !== null && event.quantity > 0) {
    const price = decimal(event.price);
    const entry = decimal(entryPrice);
    if (price && entry) return price.minus(entry).times(event.quantity);
  }
  return decimal(record(event.data)?.realizedPnl);
}

function maxDrawdown(records: readonly TradePerformanceRecord[]): Decimal {
  const ordered = [...records].sort(
    (left, right) =>
      left.closedAt.getTime() - right.closedAt.getTime() ||
      left.tradeId.localeCompare(right.tradeId),
  );
  let cumulative = new Decimal(0);
  let peak = new Decimal(0);
  let maximum = new Decimal(0);
  for (const item of ordered) {
    cumulative = cumulative.plus(item.realizedPnl);
    if (cumulative.gt(peak)) peak = cumulative;
    const drawdown = peak.minus(cumulative);
    if (drawdown.gt(maximum)) maximum = drawdown;
  }
  return maximum;
}

function groups(
  records: readonly TradePerformanceRecord[],
  keyOf: (record: TradePerformanceRecord) => string,
): [string, TradePerformanceRecord[]][] {
  const values = new Map<string, TradePerformanceRecord[]>();
  for (const item of records) {
    const key = keyOf(item);
    values.set(key, [...(values.get(key) ?? []), item]);
  }
  return [...values.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function scoreBucket(value: unknown): AnalyticsScoreBucketDefinition {
  const score = decimal(value);
  if (!score || score.lt(0) || score.gt(100)) return ANALYTICS_V1_CONFIG.unknownScoreBucket;
  return (
    ANALYTICS_V1_CONFIG.scoreBuckets.find(
      (bucket) =>
        (bucket.minimumInclusive === null || score.gte(bucket.minimumInclusive)) &&
        (bucket.maximumExclusive === null || score.lt(bucket.maximumExclusive)),
    ) ?? ANALYTICS_V1_CONFIG.unknownScoreBucket
  );
}

function candidateIds(events: readonly TradeEvent[], type: TradeEventType): Set<string> {
  return new Set(
    events
      .filter((event) => event.eventType === type && event.candidateId)
      .map((event) => event.candidateId as string),
  );
}

function average(values: readonly Decimal[]): string | null {
  return values.length ? fixed(sum(values).div(values.length)) : null;
}

function median(values: readonly Decimal[]): string | null {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left.comparedTo(right));
  const middle = Math.floor(ordered.length / 2);
  return fixed(
    ordered.length % 2 ? ordered[middle] : ordered[middle - 1].plus(ordered[middle]).div(2),
  );
}

function sum(values: readonly Decimal[]): Decimal {
  return values.reduce((total, value) => total.plus(value), ZERO);
}

function fixed(value: Decimal): string {
  return value
    .toDecimalPlaces(ANALYTICS_V1_CONFIG.decimalPlaces)
    .toFixed(ANALYTICS_V1_CONFIG.decimalPlaces);
}

function decimal(value: unknown): Decimal | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function requiredDecimal(value: unknown, label: string): Decimal {
  const parsed = decimal(value);
  if (!parsed) throw new Error(`Invalid ${label}`);
  return parsed;
}

function positiveDecimal(value: unknown): Decimal | null {
  const parsed = decimal(value);
  return parsed?.gt(0) ? parsed : null;
}

function positiveDifference(entry: unknown, stop: unknown): Decimal | null {
  const entryValue = decimal(entry);
  const stopValue = decimal(stop);
  if (!entryValue || !stopValue) return null;
  const result = entryValue.minus(stopValue);
  return result.gt(0) ? result : null;
}

function optionalDecimalText(value: unknown): string | null {
  const parsed = decimal(value);
  return parsed ? fixed(parsed) : null;
}

function decimalValues(value: unknown): Decimal[] {
  const parsed = decimal(value);
  return parsed ? [parsed] : [];
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
