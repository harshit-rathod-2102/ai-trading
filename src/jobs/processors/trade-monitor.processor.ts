import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { isWithinTimeRange, marketClock } from '../../common/utils/market-time';
import { elapsedMilliseconds, structuredError } from '../../logging/logging.utils';
import { TradeMonitorService } from '../../trade-monitor/trade-monitor.service';
import { TRADE_MONITOR_RUN } from '../job-names';
import { MarketJobData } from '../models/job-data.model';
import { MARKET_MONITORING_QUEUE } from '../queues';
import { TradingDayService } from '../services/trading-day.service';

@Processor(MARKET_MONITORING_QUEUE, { concurrency: 1 })
export class TradeMonitorProcessor extends WorkerHost {
  private readonly logger = new Logger(TradeMonitorProcessor.name);
  constructor(
    private readonly config: ConfigService,
    private readonly tradingDays: TradingDayService,
    private readonly monitor: TradeMonitorService,
  ) {
    super();
  }

  async process(job: Job<MarketJobData>) {
    const startedAt = performance.now();
    const timezone = this.config.getOrThrow<string>('scheduler.timezone');
    const clock = marketClock(new Date(), timezone);
    const fields = {
      jobId: job.id,
      jobName: job.name,
      marketDate: clock.marketDate,
      attempt: job.attemptsMade + 1,
      triggerSource: job.data.triggerSource,
    };
    this.logger.log({ event: 'job.started', ...fields }, 'Trade-monitor job started');
    try {
      const inHours = isWithinTimeRange(
        clock.hhmm,
        this.config.getOrThrow<string>('scheduler.marketOpenTime'),
        this.config.getOrThrow<string>('scheduler.marketCloseTime'),
      );
      if (!inHours || this.tradingDays.isWeekend(clock.marketDate)) {
        this.logger.log(
          { event: 'job.skipped', ...fields, reason: 'SKIPPED_OUTSIDE_MARKET_HOURS' },
          'Trade-monitor job skipped',
        );
        return { status: 'SKIPPED_OUTSIDE_MARKET_HOURS', marketDate: clock.marketDate };
      }
      if (!(await this.tradingDays.isTradingDay(clock.marketDate))) {
        this.logger.log(
          { event: 'job.skipped', ...fields, reason: 'SKIPPED_NON_TRADING_DAY' },
          'Trade-monitor job skipped',
        );
        return { status: 'SKIPPED_NON_TRADING_DAY', marketDate: clock.marketDate };
      }
      const result = await this.monitor.monitorOpenTrades();
      this.logger.log(
        { event: 'job.completed', ...fields, durationMs: elapsedMilliseconds(startedAt) },
        'Trade-monitor job completed',
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
        'Trade-monitor job failed',
      );
      throw error;
    }
  }
}
