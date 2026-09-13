import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { DateRangeDto } from './dto/date-range.dto';
import { MarketDataService } from './market-data.service';
import { MarketDataJobs } from './market-data.jobs';

@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketData: MarketDataService, private readonly jobs: MarketDataJobs) {}
  @Get('provider') provider() { return this.marketData.providerInfo(); }
  @Post('instruments/sync')
  syncInstruments() { return this.marketData.syncInstruments(); }
  @Get('universe') universe() { return this.jobs.configuredUniverse(); }
  @Get('instruments/:id/candles')
  candles(@Param('id', ParseUUIDPipe) id: string, @Query() range: DateRangeDto) {
    return this.marketData.list(id, range.from, range.to);
  }
  @Get('instruments/:id/quality')
  quality(@Param('id', ParseUUIDPipe) id: string, @Query() range: DateRangeDto) {
    return this.marketData.quality(id, range.from, range.to);
  }
  @Post('instruments/:id/refresh') @HttpCode(202)
  refresh(@Param('id', ParseUUIDPipe) id: string, @Body() range: DateRangeDto) {
    return this.jobs.enqueue(id, range.from, range.to);
  }
  @Post('refresh-universe') @HttpCode(202)
  refreshUniverse(@Body() range: DateRangeDto) { return this.jobs.enqueueUniverse(range.from, range.to); }
  @Get('jobs/:id')
  job(@Param('id') id: string) { return this.jobs.status(id); }
}
