import { Injectable, Logger } from '@nestjs/common';
import { elapsedMilliseconds, structuredError } from '../logging/logging.utils';
import { AnalyticsCalculationService } from './analytics-calculation.service';
import { AnalyticsQueryResult, AnalyticsQueryService } from './analytics-query.service';
import { ANALYTICS_V1_CONFIG } from './config/analytics-v1.config';
import { AnalyticsRangeDto } from './dto/analytics-range.dto';
import { AcceptedVsSkippedResponse } from './models/accepted-vs-skipped.model';
import { AnalyticsDateRange, AnalyticsOverview } from './models/analytics-overview.model';
import { CandidateFunnelResponse } from './models/candidate-funnel.model';
import { RegimePerformanceResponse } from './models/regime-performance.model';
import { ScoreBucketPerformanceResponse } from './models/score-bucket-performance.model';
import { SectorPerformanceResponse } from './models/sector-performance.model';
import { StrategyPerformanceResponse } from './models/strategy-performance.model';
import { TradePerformanceRecord } from './models/trade-performance-record.model';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly query: AnalyticsQueryService,
    private readonly calculation: AnalyticsCalculationService,
  ) {}

  overview(input: AnalyticsRangeDto): Promise<AnalyticsOverview> {
    return this.execute('overview', input, (source, records) => ({
      analyticsVersion: ANALYTICS_V1_CONFIG.version,
      range: responseRange(source),
      metrics: this.calculation.summarize(records),
      coverage: this.calculation.coverage(records),
    }));
  }

  strategies(input: AnalyticsRangeDto): Promise<StrategyPerformanceResponse> {
    return this.execute('strategies', input, (source, records) => ({
      analyticsVersion: ANALYTICS_V1_CONFIG.version,
      range: responseRange(source),
      coverage: this.calculation.coverage(records),
      groups: this.calculation.byStrategy(records),
    }));
  }

  regimes(input: AnalyticsRangeDto): Promise<RegimePerformanceResponse> {
    return this.execute('regimes', input, (source, records) => ({
      analyticsVersion: ANALYTICS_V1_CONFIG.version,
      range: responseRange(source),
      coverage: this.calculation.coverage(records),
      groups: this.calculation.byRegime(records),
    }));
  }

  sectors(input: AnalyticsRangeDto): Promise<SectorPerformanceResponse> {
    return this.execute('sectors', input, (source, records) => ({
      analyticsVersion: ANALYTICS_V1_CONFIG.version,
      range: responseRange(source),
      coverage: this.calculation.coverage(records),
      groups: this.calculation.bySector(records),
    }));
  }

  scoreBuckets(input: AnalyticsRangeDto): Promise<ScoreBucketPerformanceResponse> {
    return this.execute('score-buckets', input, (source, records) => ({
      analyticsVersion: ANALYTICS_V1_CONFIG.version,
      range: responseRange(source),
      coverage: this.calculation.coverage(records),
      buckets: this.calculation.byScoreBucket(source.candidates, records),
    }));
  }

  acceptedVsSkipped(input: AnalyticsRangeDto): Promise<AcceptedVsSkippedResponse> {
    return this.execute('accepted-vs-skipped', input, (source, records) => ({
      analyticsVersion: ANALYTICS_V1_CONFIG.version,
      range: responseRange(source),
      coverage: this.calculation.coverage(records),
      comparison: this.calculation.acceptedVsSkipped(records, source.decisionEvents),
    }));
  }

  funnel(input: AnalyticsRangeDto): Promise<CandidateFunnelResponse> {
    return this.execute('funnel', input, (source) => ({
      analyticsVersion: ANALYTICS_V1_CONFIG.version,
      range: responseRange(source),
      funnel: this.calculation.funnel(source.scanResults, source.candidates, source.decisionEvents),
    }));
  }

  private async execute<Result>(
    operation: string,
    input: AnalyticsRangeDto,
    build: (source: AnalyticsQueryResult, records: readonly TradePerformanceRecord[]) => Result,
  ): Promise<Result> {
    const startedAt = performance.now();
    this.logger.log(
      {
        event: 'analytics.query.started',
        module: AnalyticsService.name,
        operation,
        analyticsVersion: ANALYTICS_V1_CONFIG.version,
        from: input.from ?? null,
        to: input.to ?? null,
      },
      'Analytics query started',
    );
    try {
      const source = await this.query.load(input);
      const records = this.calculation.normalizeTrades(source.closedTrades, source.tradeEvents);
      const result = build(source, records);
      this.logger.log(
        {
          event: 'analytics.query.completed',
          module: AnalyticsService.name,
          operation,
          analyticsVersion: ANALYTICS_V1_CONFIG.version,
          from: source.range.from,
          to: source.range.to,
          closedTradeCount: records.length,
          durationMs: elapsedMilliseconds(startedAt),
        },
        'Analytics query completed',
      );
      return result;
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'analytics.query.failed',
          module: AnalyticsService.name,
          operation,
          analyticsVersion: ANALYTICS_V1_CONFIG.version,
          from: input.from ?? null,
          to: input.to ?? null,
          durationMs: elapsedMilliseconds(startedAt),
          ...structuredError(error),
        },
        'Analytics query failed',
      );
      throw error;
    }
  }
}

function responseRange(source: AnalyticsQueryResult): AnalyticsDateRange {
  return {
    from: source.range.from,
    to: source.range.to,
    timezone: ANALYTICS_V1_CONFIG.timezone,
  };
}
