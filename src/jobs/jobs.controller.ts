import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { JobTriggerSource } from './models/job-data.model';
import { JobOrchestrationService } from './services/job-orchestration.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobOrchestrationService) {}

  @Post('trade-monitor/run')
  @HttpCode(HttpStatus.ACCEPTED)
  runTradeMonitor() {
    return this.jobs.enqueueTradeMonitor(JobTriggerSource.MANUAL);
  }

  @Post('post-market/run')
  @HttpCode(HttpStatus.ACCEPTED)
  runPostMarket() {
    return this.jobs.enqueuePostMarket(JobTriggerSource.MANUAL);
  }

  @Post('evening/run')
  @HttpCode(HttpStatus.ACCEPTED)
  runEvening() {
    return this.jobs.enqueueEvening(JobTriggerSource.MANUAL);
  }
}
