import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DateRangeDto } from './dto/date-range.dto';
import { MarketDataService } from './market-data.service';
import { MarketDataJobs } from './market-data.jobs';

@ApiTags('Market Data')
@Controller('market-data')
export class MarketDataController {
  constructor(
    private readonly marketData: MarketDataService,
    private readonly jobs: MarketDataJobs,
  ) {}

  @Get('provider')
  @ApiOperation({ summary: 'Read a compact provider summary without external calls' })
  @ApiQuery({
    name: 'includeDetails',
    required: false,
    type: Boolean,
    description:
      'Default false. True fetches the full catalog and calendar and may be slow or large.',
  })
  provider(
    @Query('includeDetails', new DefaultValuePipe(false), ParseBoolPipe) includeDetails: boolean,
  ) {
    return this.marketData.providerInfo(includeDetails);
  }

  @Post('instruments/sync')
  @ApiOperation({ summary: 'Synchronize provider instruments into the local catalog' })
  syncInstruments() {
    return this.marketData.syncInstruments();
  }

  @Get('universe') universe() {
    return this.jobs.configuredUniverse();
  }

  @Get('instruments/:id/candles')
  @ApiParam({ name: 'id', format: 'uuid' })
  candles(@Param('id', ParseUUIDPipe) id: string, @Query() range: DateRangeDto) {
    return this.marketData.list(id, range.from, range.to);
  }

  @Get('instruments/:id/quality')
  @ApiParam({ name: 'id', format: 'uuid' })
  quality(@Param('id', ParseUUIDPipe) id: string, @Query() range: DateRangeDto) {
    return this.marketData.quality(id, range.from, range.to);
  }

  @Post('instruments/:id/refresh')
  @HttpCode(202)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Queue a daily-candle refresh for one instrument' })
  refresh(@Param('id', ParseUUIDPipe) id: string, @Body() range: DateRangeDto) {
    return this.jobs.enqueue(id, range.from, range.to);
  }

  @Post('refresh-universe')
  @HttpCode(202)
  @ApiOperation({ summary: 'Queue daily-candle refreshes for the configured universe' })
  refreshUniverse(@Body() range: DateRangeDto) {
    return this.jobs.enqueueUniverse(range.from, range.to);
  }

  @Get('jobs/:id')
  job(@Param('id') id: string) {
    return this.jobs.status(id);
  }
}
