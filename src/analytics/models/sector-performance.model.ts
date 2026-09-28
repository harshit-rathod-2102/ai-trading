import { ApiProperty } from '@nestjs/swagger';
import {
  AnalyticsCoverage,
  AnalyticsDateRange,
  PerformanceMetrics,
} from './analytics-overview.model';

export class SectorPerformance {
  @ApiProperty({ example: 'Energy' }) sector!: string;

  @ApiProperty({ type: PerformanceMetrics }) performance!: PerformanceMetrics;
}

export class SectorPerformanceResponse {
  @ApiProperty({ example: 'analytics-v1' }) analyticsVersion!: string;

  @ApiProperty({ type: AnalyticsDateRange }) range!: AnalyticsDateRange;

  @ApiProperty({ type: AnalyticsCoverage }) coverage!: AnalyticsCoverage;

  @ApiProperty({ type: [SectorPerformance] }) groups!: SectorPerformance[];
}
