import { ApiProperty } from '@nestjs/swagger';
import { AnalyticsDateRange } from './analytics-overview.model';

export class CandidateFunnel {
  @ApiProperty({ example: 120 }) scanResults!: number;

  @ApiProperty({ example: 24 }) shortlisted!: number;

  @ApiProperty({ example: 18 }) riskApprovedCandidates!: number;

  @ApiProperty({ example: 14 }) qualifiedCandidates!: number;

  @ApiProperty({ example: 12 }) notifiedCandidates!: number;

  @ApiProperty({ example: 7 }) acceptedCandidates!: number;

  @ApiProperty({ example: 5 }) skippedCandidates!: number;
}

export class CandidateFunnelResponse {
  @ApiProperty({ example: 'analytics-v1' }) analyticsVersion!: string;

  @ApiProperty({ type: AnalyticsDateRange }) range!: AnalyticsDateRange;

  @ApiProperty({ type: CandidateFunnel }) funnel!: CandidateFunnel;
}
