import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { marketClock } from '../../common/utils/market-time';
import { EVENING_SUMMARY, POST_MARKET_PIPELINE, TRADE_MONITOR_RUN } from '../job-names';
import { JobTriggerSource, MarketJobData, PostMarketJobData } from '../models/job-data.model';
import { EVENING_QUEUE, MARKET_MONITORING_QUEUE, POST_MARKET_QUEUE } from '../queues';
import { TradingDayService } from './trading-day.service';

@Injectable()
export class JobOrchestrationService {
  constructor(
    private readonly config: ConfigService,
    @InjectQueue(MARKET_MONITORING_QUEUE) private readonly monitoringQueue: Queue<MarketJobData>,
    @InjectQueue(POST_MARKET_QUEUE) private readonly postMarketQueue: Queue<PostMarketJobData>,
    @InjectQueue(EVENING_QUEUE) private readonly eveningQueue: Queue<MarketJobData>,
    private readonly tradingDays: TradingDayService,
  ) {}

  async enqueueTradeMonitor(triggerSource = JobTriggerSource.MANUAL, now = new Date()) {
    const clock = marketClock(now, this.config.getOrThrow<string>('scheduler.timezone'));
    const interval = this.config.getOrThrow<number>('scheduler.tradeMonitorIntervalMinutes');
    const slotMinute = Math.floor(clock.minute / interval) * interval;
    const slot = `${String(clock.hour).padStart(2, '0')}${String(slotMinute).padStart(2, '0')}`;
    const data = { triggerSource, requestedAt: now.toISOString() };
    const job = await this.monitoringQueue.add(TRADE_MONITOR_RUN, data, {
      jobId: `trade-monitor-${clock.marketDate}-${slot}`,
      attempts: 2,
      backoff: { type: 'fixed', delay: 30_000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: false,
    });
    return this.jobResponse(job, data, triggerSource);
  }

  async enqueuePostMarket(
    triggerSource = JobTriggerSource.MANUAL,
    marketDate?: string,
    now = new Date(),
  ) {
    const date =
      marketDate ??
      marketClock(now, this.config.getOrThrow<string>('scheduler.timezone')).marketDate;
    const data = { triggerSource, marketDate: date, requestedAt: now.toISOString() };
    const job = await this.postMarketQueue.add(POST_MARKET_PIPELINE, data, {
      jobId: `post-market-${date}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { count: 400 },
      removeOnFail: false,
    });
    return { ...(await this.jobResponse(job, data, triggerSource)), marketDate: date };
  }

  async enqueueLatestCompletedPipeline(triggerSource = JobTriggerSource.MANUAL, now = new Date()) {
    const timezone = this.config.getOrThrow<string>('scheduler.timezone');
    const marketDate = await this.tradingDays.latestCompletedSession(now, timezone);
    return this.enqueuePostMarket(triggerSource, marketDate, now);
  }

  async enqueueEvening(triggerSource = JobTriggerSource.MANUAL, now = new Date()) {
    const date = marketClock(now, this.config.getOrThrow<string>('scheduler.timezone')).marketDate;
    const data = { triggerSource, requestedAt: now.toISOString() };
    const job = await this.eveningQueue.add(EVENING_SUMMARY, data, {
      jobId: `evening-${date}`,
      attempts: 2,
      backoff: { type: 'fixed', delay: 60_000 },
      removeOnComplete: { count: 400 },
      removeOnFail: false,
    });
    return this.jobResponse(job, data, triggerSource);
  }

  private async jobResponse<T extends MarketJobData>(
    job: Job<T>,
    data: T,
    triggerSource: JobTriggerSource,
  ) {
    let state = await job.getState();
    if (state === 'failed') {
      await job.updateData(data);
      await job.retry();
      state = 'waiting';
    }
    return {
      jobId: job.id,
      jobName: job.name,
      triggerSource,
      status: state,
      reused: state === 'completed' || state === 'active' || state === 'delayed',
    };
  }
}
