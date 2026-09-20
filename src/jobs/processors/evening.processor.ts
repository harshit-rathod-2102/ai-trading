import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { marketClock } from '../../common/utils/market-time';
import { elapsedMilliseconds, structuredError } from '../../logging/logging.utils';
import { MarketJobData } from '../models/job-data.model';
import { EVENING_QUEUE } from '../queues';
import { EveningService } from '../services/evening.service';

@Processor(EVENING_QUEUE, { concurrency: 1 })
export class EveningProcessor extends WorkerHost {
  private readonly logger = new Logger(EveningProcessor.name);
  constructor(
    private readonly evening: EveningService,
    private readonly config: ConfigService,
  ) {
    super();
  }
  async process(job: Job<MarketJobData>) {
    const startedAt = performance.now();
    const marketDate = marketClock(
      new Date(),
      this.config.getOrThrow<string>('scheduler.timezone'),
    ).marketDate;
    const fields = {
      jobId: job.id,
      jobName: job.name,
      marketDate,
      attempt: job.attemptsMade + 1,
      triggerSource: job.data.triggerSource,
    };
    this.logger.log({ event: 'job.started', ...fields }, 'Evening job started');
    try {
      const result = await this.evening.run(marketDate);
      this.logger.log(
        { event: 'job.completed', ...fields, durationMs: elapsedMilliseconds(startedAt) },
        'Evening job completed',
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
        'Evening job failed',
      );
      throw error;
    }
  }
}
