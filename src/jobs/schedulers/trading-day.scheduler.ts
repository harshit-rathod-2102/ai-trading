import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { marketClock, timeToMinutes } from '../../common/utils/market-time';
import {
  EVENING_SCHEDULER_ID,
  EVENING_SUMMARY,
  POST_MARKET_PIPELINE,
  POST_MARKET_SCHEDULER_ID,
  TRADE_MONITOR_RUN,
  TRADE_MONITOR_SCHEDULER_ID,
} from '../job-names';
import { JobTriggerSource, MarketJobData, PostMarketJobData } from '../models/job-data.model';
import { EVENING_QUEUE, MARKET_MONITORING_QUEUE, POST_MARKET_QUEUE } from '../queues';
import { DailyPipelineService } from '../services/daily-pipeline.service';
import { JobOrchestrationService } from '../services/job-orchestration.service';
import { TradingDayService } from '../services/trading-day.service';

@Injectable()
export class TradingDayScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(TradingDayScheduler.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jobs: JobOrchestrationService,
    private readonly pipeline: DailyPipelineService,
    private readonly tradingDays: TradingDayService,
    @InjectQueue(MARKET_MONITORING_QUEUE) private readonly monitoringQueue: Queue<MarketJobData>,
    @InjectQueue(POST_MARKET_QUEUE) private readonly postMarketQueue: Queue<PostMarketJobData>,
    @InjectQueue(EVENING_QUEUE) private readonly eveningQueue: Queue<MarketJobData>,
  ) {}

  async onApplicationBootstrap(now = new Date()): Promise<void> {
    this.validateTimes();
    if (!this.config.getOrThrow<boolean>('scheduler.enabled')) {
      await Promise.all([
        this.monitoringQueue.removeJobScheduler(TRADE_MONITOR_SCHEDULER_ID),
        this.postMarketQueue.removeJobScheduler(POST_MARKET_SCHEDULER_ID),
        this.eveningQueue.removeJobScheduler(EVENING_SCHEDULER_ID),
      ]);
      this.logger.log({ event: 'scheduler.disabled', status: 'disabled' }, 'Production schedules disabled');
      return;
    }

    const timezone = this.config.getOrThrow<string>('scheduler.timezone');
    const interval = this.config.getOrThrow<number>('scheduler.tradeMonitorIntervalMinutes');
    const open = this.parts(this.config.getOrThrow<string>('scheduler.marketOpenTime'));
    const close = this.parts(this.config.getOrThrow<string>('scheduler.marketCloseTime'));
    const post = this.parts(this.config.getOrThrow<string>('scheduler.postMarketRunTime'));
    const evening = this.parts(this.config.getOrThrow<string>('scheduler.eveningRunTime'));
    const retained = { attempts: 2, backoff: { type: 'fixed' as const, delay: 30_000 },
      removeOnComplete: { count: 1000 }, removeOnFail: false };
    await this.monitoringQueue.upsertJobScheduler(TRADE_MONITOR_SCHEDULER_ID, {
      pattern: `*/${interval} ${open.hour}-${close.hour} * * 1-5`, tz: timezone,
    }, { name: TRADE_MONITOR_RUN, data: { triggerSource: JobTriggerSource.SCHEDULED }, opts: retained });
    await this.postMarketQueue.upsertJobScheduler(POST_MARKET_SCHEDULER_ID, {
      pattern: `${post.minute} ${post.hour} * * 1-5`, tz: timezone,
    }, { name: POST_MARKET_PIPELINE, data: { triggerSource: JobTriggerSource.SCHEDULED },
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: { count: 400 }, removeOnFail: false } });
    await this.eveningQueue.upsertJobScheduler(EVENING_SCHEDULER_ID, {
      pattern: `${evening.minute} ${evening.hour} * * 1-5`, tz: timezone,
    }, { name: EVENING_SUMMARY, data: { triggerSource: JobTriggerSource.SCHEDULED }, opts: retained });
    this.logger.log({ event: 'scheduler.registered', timezone,
      tradeMonitorPattern: `*/${interval} ${open.hour}-${close.hour} * * 1-5`,
      postMarketTime: this.config.getOrThrow<string>('scheduler.postMarketRunTime'),
      eveningTime: this.config.getOrThrow<string>('scheduler.eveningRunTime'), status: 'registered' },
    'Operating-cycle schedules registered');
    try {
      await this.enqueueCatchUpIfNeeded(now);
    } catch (error: unknown) {
      this.logger.warn({ event: 'scheduler.catch_up.failed', status: 'deferred',
        errorMessage: error instanceof Error ? error.message : 'Unknown catch-up check failure' },
      'Catch-up check failed; application startup will continue');
    }
  }

  private async enqueueCatchUpIfNeeded(nowValue: Date): Promise<void> {
    const timezone = this.config.getOrThrow<string>('scheduler.timezone');
    const clock = marketClock(nowValue, timezone);
    const now = timeToMinutes(clock.hhmm);
    const post = timeToMinutes(this.config.getOrThrow<string>('scheduler.postMarketRunTime'));
    const cutoff = timeToMinutes(this.config.getOrThrow<string>('scheduler.catchUpCutoffTime'));
    if (now < post || now >= cutoff || !await this.tradingDays.isTradingDay(clock.marketDate) ||
        await this.pipeline.hasSuccessfulRun(clock.marketDate)) return;
    const result = await this.jobs.enqueuePostMarket(JobTriggerSource.CATCH_UP, clock.marketDate);
    this.logger.log({ event: 'scheduler.catch_up.enqueued', marketDate: clock.marketDate,
      jobId: result.jobId, status: 'queued' }, 'Post-market catch-up enqueued');
  }

  private validateTimes(): void {
    const open = timeToMinutes(this.config.getOrThrow<string>('scheduler.marketOpenTime'));
    const close = timeToMinutes(this.config.getOrThrow<string>('scheduler.marketCloseTime'));
    const post = timeToMinutes(this.config.getOrThrow<string>('scheduler.postMarketRunTime'));
    const evening = timeToMinutes(this.config.getOrThrow<string>('scheduler.eveningRunTime'));
    const cutoff = timeToMinutes(this.config.getOrThrow<string>('scheduler.catchUpCutoffTime'));
    if (!(open < close && close < post && post < evening && post < cutoff)) {
      throw new Error('Scheduler times must satisfy market open < close < post-market < evening and catch-up cutoff');
    }
  }

  private parts(value: string): { hour: number; minute: number } {
    const [hour, minute] = value.split(':').map(Number);
    return { hour, minute };
  }
}
