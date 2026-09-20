import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { marketClock } from '../../common/utils/market-time';
import { elapsedMilliseconds, structuredError } from '../../logging/logging.utils';
import { PostMarketJobData } from '../models/job-data.model';
import { POST_MARKET_QUEUE } from '../queues';
import { DailyPipelineService } from '../services/daily-pipeline.service';

@Processor(POST_MARKET_QUEUE, { concurrency: 1 })
export class PostMarketProcessor extends WorkerHost {
  private readonly logger = new Logger(PostMarketProcessor.name);
  constructor(
    private readonly pipeline: DailyPipelineService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<PostMarketJobData>) {
    const startedAt = performance.now();
    const marketDate =
      job.data.marketDate ??
      marketClock(new Date(), this.config.getOrThrow<string>('scheduler.timezone')).marketDate;
    const data = { ...job.data, marketDate };
    const fields = {
      jobId: job.id,
      jobName: job.name,
      marketDate,
      attempt: job.attemptsMade + 1,
      triggerSource: data.triggerSource,
    };
    this.logger.log({ event: 'job.started', ...fields }, 'Post-market job started');
    try {
      const result = await this.pipeline.run(data, job);
      this.logger.log(
        { event: 'job.completed', ...fields, durationMs: elapsedMilliseconds(startedAt) },
        'Post-market job completed',
      );
      return result;
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'job.failed',
          ...fields,
          durationMs: elapsedMilliseconds(startedAt),
          ...structuredError(error),
        },
        'Post-market job failed',
      );
      throw error;
    }
  }
}
