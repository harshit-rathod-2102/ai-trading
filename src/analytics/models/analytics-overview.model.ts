import { ApiProperty } from '@nestjs/swagger';

export class AnalyticsDateRange {
  @ApiProperty({ type: String, nullable: true, example: '2026-01-01' })
  from!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2026-09-20' })
  to!: string | null;

  @ApiProperty({ example: 'Asia/Kolkata' })
  timezone!: string;
}

export class AnalyticsCoverage {
  @ApiProperty({ example: 23 }) closedTrades!: number;

  @ApiProperty({ example: 21 }) tradesWithValidR!: number;

  @ApiProperty({ example: 17 }) tradesWithMfeMae!: number;

  @ApiProperty({ example: 18 }) tradesWithMfe!: number;

  @ApiProperty({ example: 17 }) tradesWithMae!: number;

  @ApiProperty({ example: 22 }) tradesWithSector!: number;

  @ApiProperty({ example: 23 }) tradesWithRegime!: number;

  @ApiProperty({ example: 22 }) tradesWithQuantScore!: number;

  @ApiProperty({ example: 20 }) tradesWithRank!: number;

  @ApiProperty({ example: 19 }) tradesWithExitEvents!: number;

  @ApiProperty({ example: 4 }) tradesUsingPersistedPnlFallback!: number;

  @ApiProperty({ example: 2 }) invalidRiskTrades!: number;
}

export class PerformanceMetrics {
  @ApiProperty({ example: 23 }) totalClosedTrades!: number;

  @ApiProperty({ example: 12 }) winningTrades!: number;

  @ApiProperty({ example: 9 }) losingTrades!: number;

  @ApiProperty({ example: 2 }) breakevenTrades!: number;

  @ApiProperty({ type: String, nullable: true, example: '0.5714' }) winRate!: string | null;

  @ApiProperty({ example: '42000.0000' }) grossProfit!: string;

  @ApiProperty({ example: '17000.0000' }) grossLoss!: string;

  @ApiProperty({ example: '25000.0000' }) netRealizedPnl!: string;

  @ApiProperty({ type: String, nullable: true, example: '3500.0000' })
  averageWinner!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '-1888.8889' })
  averageLoser!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2.4706' })
  profitFactor!: string | null;

  @ApiProperty({ example: 21 }) rSampleSize!: number;

  @ApiProperty({ type: String, nullable: true, example: '0.4286' }) expectancyR!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '0.4286' }) averageR!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '0.2500' }) medianR!: string | null;

  @ApiProperty({ example: '12500.0000', description: 'Positive peak-to-trough loss magnitude' })
  maxDrawdown!: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  maxDrawdownPercent!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '76.5000' })
  averageHoldingHours!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '52.0000' })
  medianHoldingHours!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2.1000' }) averageMfeR!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '1.8000' }) medianMfeR!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '-0.7000' }) averageMaeR!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '-0.6000' }) medianMaeR!: string | null;

  @ApiProperty({ example: 17 }) mfeMaeSampleSize!: number;
}

export class AnalyticsOverview {
  @ApiProperty({ example: 'analytics-v1' }) analyticsVersion!: string;

  @ApiProperty({ type: AnalyticsDateRange }) range!: AnalyticsDateRange;

  @ApiProperty({ type: PerformanceMetrics }) metrics!: PerformanceMetrics;

  @ApiProperty({ type: AnalyticsCoverage }) coverage!: AnalyticsCoverage;
}
