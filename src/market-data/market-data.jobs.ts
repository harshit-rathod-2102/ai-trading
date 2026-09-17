import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { InstrumentsService } from '../instruments/instruments.service';
import { MarketDataService } from './market-data.service';
import { assertRange } from './market-data.validation';
import { elapsedMilliseconds, structuredError } from '../logging/logging.utils';

export const MARKET_DATA_QUEUE = 'market-data';
export interface RefreshCommand { instrumentId: string; from: string; to: string; }

@Injectable()
export class MarketDataJobs {
  private readonly logger = new Logger(MarketDataJobs.name);
  constructor(
    @InjectQueue(MARKET_DATA_QUEUE) private readonly queue: Queue<RefreshCommand>,
    private readonly instruments: InstrumentsService,
    private readonly config: ConfigService,
  ) {}

  async enqueue(instrumentId: string, from: string, to: string) {
    assertRange(from, to);
    const instrument = await this.instruments.get(instrumentId);
    if (!instrument.isActive) throw new ConflictException('Inactive instruments cannot be refreshed');
    const job = await this.queue.add('refresh-daily', { instrumentId, from, to }, {
      attempts: 3, backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 1000 }, removeOnFail: { count: 1000 },
    });
    this.logger.log({ event: 'job.enqueued', module: MarketDataJobs.name,
      operation: 'enqueue', queue: MARKET_DATA_QUEUE, jobName: job.name,
      jobId: job.id, instrumentId, status: 'queued' }, 'Job enqueued');
    return { jobId: job.id, instrumentId };
  }

  async enqueueUniverse(from: string, to: string) {
    assertRange(from, to);
    const code = this.config.getOrThrow<string>('marketData.universe');
    await this.instruments.getUniverse(code);
    const instruments = await this.instruments.list({ universe: code, active: 'true' });
    const jobs = [];
    for (const instrument of instruments) jobs.push(await this.enqueue(instrument.id, from, to));
    return { universe: code, jobs };
  }

  async configuredUniverse() {
    const code = this.config.getOrThrow<string>('marketData.universe');
    const universe = await this.instruments.getUniverse(code);
    return { ...universe, instruments: await this.instruments.list({ universe: code, active: 'true' }) };
  }

  async status(id: string) {
    if (!/^[0-9]+$/.test(id)) throw new BadRequestException('Invalid job ID');
    const job = await this.queue.getJob(id);
    if (!job) throw new NotFoundException('Refresh job not found or no longer retained');
    return { jobId: job.id, state: await job.getState(), command: job.data,
      attemptsMade: job.attemptsMade, result: job.returnvalue ?? null,
      failureReason: job.failedReason || null };
  }
}

@Processor(MARKET_DATA_QUEUE, { concurrency: 2 })
export class MarketDataWorker extends WorkerHost {
  private readonly logger = new Logger(MarketDataWorker.name);
  constructor(private readonly marketData: MarketDataService) { super(); }
  async process(job: Job<RefreshCommand>) {
    const startedAt = performance.now();
    const fields = { queue: MARKET_DATA_QUEUE, jobName: job.name, jobId: job.id,
      attempt: job.attemptsMade + 1, instrumentId: job.data.instrumentId };
    this.logger.log({ event: 'job.started', module: MarketDataWorker.name,
      operation: 'process', ...fields, status: 'started' }, 'Job started');
    try {
      if (job.name !== 'refresh-daily') throw new Error('Unsupported market-data job');
      const result = await this.marketData.refresh(job.data.instrumentId, job.data.from, job.data.to);
      this.logger.log({ event: 'job.completed', module: MarketDataWorker.name,
        operation: 'process', ...fields, durationMs: elapsedMilliseconds(startedAt),
        status: 'completed' }, 'Job completed');
      return result;
    } catch (error: unknown) {
      const maxAttempts = job.opts.attempts ?? 1;
      const finalAttempt = job.attemptsMade + 1 >= maxAttempts;
      const details = { event: finalAttempt ? 'job.failed' : 'job.retrying',
        module: MarketDataWorker.name, operation: 'process', ...fields, maxAttempts,
        durationMs: elapsedMilliseconds(startedAt), status: finalAttempt ? 'failed' : 'retrying',
        ...structuredError(error) };
      if (finalAttempt) this.logger.error(details, 'Job failed');
      else this.logger.warn(details, 'Job attempt failed and will be retried');
      throw error;
    }
  }
}
