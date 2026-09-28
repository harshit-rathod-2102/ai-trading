import { ApiProperty } from '@nestjs/swagger';
import {
  AnalyticsCoverage,
  AnalyticsDateRange,
  PerformanceMetrics,
} from './analytics-overview.model';

export class RegimePerformance {
  @ApiProperty({ example: 'BULLISH' }) regime!: string;

  @ApiProperty({ type: PerformanceMetrics }) performance!: PerformanceMetrics;
}

export class RegimePerformanceResponse {
  @ApiProperty({ example: 'analytics-v1' }) analyticsVersion!: string;

  @ApiProperty({ type: AnalyticsDateRange }) range!: AnalyticsDateRange;

  @ApiProperty({ type: AnalyticsCoverage }) coverage!: AnalyticsCoverage;

  @ApiProperty({ type: [RegimePerformance] }) groups!: RegimePerformance[];
}
