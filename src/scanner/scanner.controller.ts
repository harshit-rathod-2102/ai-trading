import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ScanResultsQueryDto } from './dto/scan-results-query.dto';
import { ScannerService } from './scanner.service';

@ApiTags('Scanner')
@Controller('scanner')
export class ScannerController {
  constructor(private readonly scanner: ScannerService) {}

  @Post('run')
  @ApiOperation({ summary: 'Run or reuse the deterministic daily scan' })
  run() {
    return this.scanner.runDailyScan();
  }

  @Get('runs')
  runs() {
    return this.scanner.listRuns();
  }

  @Get('runs/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  runById(@Param('id', ParseUUIDPipe) id: string) {
    return this.scanner.getRun(id);
  }

  @Get('runs/:id/results')
  @ApiParam({ name: 'id', format: 'uuid' })
  results(@Param('id', ParseUUIDPipe) id: string, @Query() query: ScanResultsQueryDto) {
    return this.scanner.listResults(id, query);
  }
}
