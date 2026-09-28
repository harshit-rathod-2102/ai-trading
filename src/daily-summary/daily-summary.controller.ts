import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { DailySummaryService } from './daily-summary.service';

@ApiTags('Daily Summary')
@Controller('daily-summary')
export class DailySummaryController {
  constructor(private readonly summaries: DailySummaryService) {}

  @Get(':marketDate')
  @ApiOperation({ summary: 'Preview a deterministic daily summary without sending it' })
  @ApiParam({ name: 'marketDate', example: '2026-09-19', description: 'NSE date (YYYY-MM-DD)' })
  preview(@Param('marketDate') marketDate: string) {
    return this.summaries.preview(marketDate);
  }

  @Post(':marketDate/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send or reuse the idempotent daily WhatsApp summary' })
  @ApiParam({ name: 'marketDate', example: '2026-09-19', description: 'NSE date (YYYY-MM-DD)' })
  send(@Param('marketDate') marketDate: string) {
    return this.summaries.sendSummary(marketDate);
  }
}
