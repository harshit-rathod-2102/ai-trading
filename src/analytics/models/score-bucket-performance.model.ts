import { ApiProperty } from '@nestjs/swagger';
import {
  AnalyticsCoverage,
  AnalyticsDateRange,
  PerformanceMetrics,
} from './analytics-overview.model';

export class ScoreBucketPerformance {
  @ApiProperty({ example: '80_89_99' }) key!: string;

  @ApiProperty({ example: '80-89.99' }) label!: string;

  @ApiProperty({ type: String, nullable: true, example: '80' }) minimumInclusive!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '90' }) maximumExclusive!: string | null;

  @ApiProperty({ example: 8 }) candidateCount!: number;

  @ApiProperty({ example: 5 }) closedTradeCount!: number;

  @ApiProperty({ type: PerformanceMetrics }) performance!: PerformanceMetrics;
}

export class ScoreBucketPerformanceResponse {
  @ApiProperty({ example: 'analytics-v1' }) analyticsVersion!: string;

  @ApiProperty({ type: AnalyticsDateRange }) range!: AnalyticsDateRange;

  @ApiProperty({ type: AnalyticsCoverage }) coverage!: AnalyticsCoverage;

  @ApiProperty({ type: [ScoreBucketPerformance] }) buckets!: ScoreBucketPerformance[];
}
