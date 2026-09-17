import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ScanResultsQueryDto } from './dto/scan-results-query.dto';
import { ScannerService } from './scanner.service';

@Controller('scanner')
export class ScannerController {
  constructor(private readonly scanner: ScannerService) {}

  @Post('run')
  run() { return this.scanner.runDailyScan(); }

  @Get('runs')
  runs() { return this.scanner.listRuns(); }

  @Get('runs/:id')
  runById(@Param('id', ParseUUIDPipe) id: string) { return this.scanner.getRun(id); }

  @Get('runs/:id/results')
  results(@Param('id', ParseUUIDPipe) id: string, @Query() query: ScanResultsQueryDto) {
    return this.scanner.listResults(id, query);
  }
}
