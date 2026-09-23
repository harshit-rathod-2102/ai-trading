import { ApiProperty } from '@nestjs/swagger';
import { AnalyticsCoverage, AnalyticsDateRange } from './analytics-overview.model';

export class AcceptedVsSkipped {
  @ApiProperty({ example: 12 }) acceptedCount!: number;

  @ApiProperty({ example: 8 }) skippedCount!: number;

  @ApiProperty({ example: 9 }) acceptedClosedTrades!: number;

  @ApiProperty({ example: '12500.0000' }) acceptedNetPnl!: string;

  @ApiProperty({ type: String, nullable: true, example: '0.3500' })
  acceptedAverageR!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '0.6250' })
  acceptedWinRate!: string | null;

  @ApiProperty({ example: false }) skippedOutcomeAvailable!: boolean;
}

export class AcceptedVsSkippedResponse {
  @ApiProperty({ example: 'analytics-v1' }) analyticsVersion!: string;

  @ApiProperty({ type: AnalyticsDateRange }) range!: AnalyticsDateRange;

  @ApiProperty({ type: AnalyticsCoverage }) coverage!: AnalyticsCoverage;

  @ApiProperty({ type: AcceptedVsSkipped }) comparison!: AcceptedVsSkipped;
}
