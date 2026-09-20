import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { DailySummaryService } from './daily-summary.service';

@Controller('daily-summary')
export class DailySummaryController {
  constructor(private readonly summaries: DailySummaryService) {}

  @Get(':marketDate')
  preview(@Param('marketDate') marketDate: string) {
    return this.summaries.preview(marketDate);
  }

  @Post(':marketDate/send')
  @HttpCode(HttpStatus.OK)
  send(@Param('marketDate') marketDate: string) {
    return this.summaries.sendSummary(marketDate);
  }
}
