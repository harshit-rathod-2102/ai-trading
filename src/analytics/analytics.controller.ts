import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRangeDto } from './dto/analytics-range.dto';
import { AcceptedVsSkippedResponse } from './models/accepted-vs-skipped.model';
import { AnalyticsOverview } from './models/analytics-overview.model';
import { CandidateFunnelResponse } from './models/candidate-funnel.model';
import { RegimePerformanceResponse } from './models/regime-performance.model';
import { ScoreBucketPerformanceResponse } from './models/score-bucket-performance.model';
import { SectorPerformanceResponse } from './models/sector-performance.model';
import { StrategyPerformanceResponse } from './models/strategy-performance.model';

@ApiTags('Analytics')
@ApiBadRequestResponse({ description: 'The requested Asia/Kolkata date range is invalid' })
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get realized trading-performance overview' })
  @ApiOkResponse({ type: AnalyticsOverview })
  overview(@Query() range: AnalyticsRangeDto): Promise<AnalyticsOverview> {
    return this.analytics.overview(range);
  }

  @Get('strategies')
  @ApiOperation({ summary: 'Group realized performance by strategy and version' })
  @ApiOkResponse({ type: StrategyPerformanceResponse })
  strategies(@Query() range: AnalyticsRangeDto): Promise<StrategyPerformanceResponse> {
    return this.analytics.strategies(range);
  }

  @Get('regimes')
  @ApiOperation({ summary: 'Group realized performance by decision-time market regime' })
  @ApiOkResponse({ type: RegimePerformanceResponse })
  regimes(@Query() range: AnalyticsRangeDto): Promise<RegimePerformanceResponse> {
    return this.analytics.regimes(range);
  }

  @Get('sectors')
  @ApiOperation({ summary: 'Group realized performance by persisted candidate sector' })
  @ApiOkResponse({ type: SectorPerformanceResponse })
  sectors(@Query() range: AnalyticsRangeDto): Promise<SectorPerformanceResponse> {
    return this.analytics.sectors(range);
  }

  @Get('score-buckets')
  @ApiOperation({ summary: 'Compare candidate and closed-trade outcomes by quant-score bucket' })
  @ApiOkResponse({ type: ScoreBucketPerformanceResponse })
  scoreBuckets(@Query() range: AnalyticsRangeDto): Promise<ScoreBucketPerformanceResponse> {
    return this.analytics.scoreBuckets(range);
  }

  @Get('accepted-vs-skipped')
  @ApiOperation({
    summary: 'Compare accepted outcomes with skipped-candidate counts',
    description: 'Skipped counterfactual P&L is unavailable in V1 and is never fabricated.',
  })
  @ApiOkResponse({ type: AcceptedVsSkippedResponse })
  acceptedVsSkipped(@Query() range: AnalyticsRangeDto): Promise<AcceptedVsSkippedResponse> {
    return this.analytics.acceptedVsSkipped(range);
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Get persisted scanner-to-decision conversion counts' })
  @ApiOkResponse({ type: CandidateFunnelResponse })
  funnel(@Query() range: AnalyticsRangeDto): Promise<CandidateFunnelResponse> {
    return this.analytics.funnel(range);
  }
}
