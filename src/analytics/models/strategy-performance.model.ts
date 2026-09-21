import { ApiProperty } from '@nestjs/swagger';
import {
  AnalyticsCoverage,
  AnalyticsDateRange,
  PerformanceMetrics,
} from './analytics-overview.model';

export class StrategyPerformance {
  @ApiProperty({ example: 'MOMENTUM_BREAKOUT' }) strategy!: string;

  @ApiProperty({ example: 'momentum-breakout-v1' }) strategyVersion!: string;

  @ApiProperty({ type: PerformanceMetrics }) performance!: PerformanceMetrics;
}

export class StrategyPerformanceResponse {
  @ApiProperty({ example: 'analytics-v1' }) analyticsVersion!: string;

  @ApiProperty({ type: AnalyticsDateRange }) range!: AnalyticsDateRange;

  @ApiProperty({ type: AnalyticsCoverage }) coverage!: AnalyticsCoverage;

  @ApiProperty({ type: [StrategyPerformance] }) groups!: StrategyPerformance[];
}
