import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JobTriggerSource } from './models/job-data.model';
import { JobOrchestrationService } from './services/job-orchestration.service';

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobOrchestrationService) {}

  @Post('trade-monitor/run')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue the guarded trade-monitor job' })
  @ApiResponse({ status: 202, description: 'Job accepted by BullMQ.' })
  runTradeMonitor() {
    return this.jobs.enqueueTradeMonitor(JobTriggerSource.MANUAL);
  }

  @Post('post-market/run')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue the post-market daily pipeline' })
  @ApiResponse({ status: 202, description: 'Job accepted by BullMQ.' })
  runPostMarket() {
    return this.jobs.enqueuePostMarket(JobTriggerSource.MANUAL);
  }

  @Post('run-now')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue the pipeline for the latest completed NSE session' })
  @ApiResponse({ status: 202, description: 'Latest completed-session job accepted by BullMQ.' })
  runLatestCompletedPipeline() {
    return this.jobs.enqueueLatestCompletedPipeline(JobTriggerSource.MANUAL);
  }

  @Post('evening/run')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue the evening summary job' })
  @ApiResponse({ status: 202, description: 'Job accepted by BullMQ.' })
  runEvening() {
    return this.jobs.enqueueEvening(JobTriggerSource.MANUAL);
  }
}
