import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { CandidatesModule } from '../candidates/candidates.module';
import { InstrumentsModule } from '../instruments/instruments.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { MessagingModule } from '../messaging/messaging.module';
import { NewsModule } from '../news/news.module';
import { ScannerModule } from '../scanner/scanner.module';
import { TradeMonitorModule } from '../trade-monitor/trade-monitor.module';
import { DailySummaryModule } from '../daily-summary/daily-summary.module';
import { DailyPipelineRun } from './entities/daily-pipeline-run.entity';
import { JobsController } from './jobs.controller';
import { CandidateAnalysisProcessor } from './processors/candidate-analysis.processor';
import { EveningProcessor } from './processors/evening.processor';
import { PostMarketProcessor } from './processors/post-market.processor';
import { TradeMonitorProcessor } from './processors/trade-monitor.processor';
import {
  CANDIDATE_ANALYSIS_QUEUE,
  EVENING_QUEUE,
  MARKET_MONITORING_QUEUE,
  POST_MARKET_QUEUE,
} from './queues';
import { TradingDayScheduler } from './schedulers/trading-day.scheduler';
import { CandidateAnalysisService } from './services/candidate-analysis.service';
import { DailyPipelineService } from './services/daily-pipeline.service';
import { EveningService } from './services/evening.service';
import { JobOrchestrationService } from './services/job-orchestration.service';
import { TradingDayService } from './services/trading-day.service';

export const SYSTEM_QUEUE = 'system';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.getOrThrow<string>('redis.host'),
          port: configService.getOrThrow<number>('redis.port'),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: SYSTEM_QUEUE },
      { name: MARKET_MONITORING_QUEUE },
      { name: POST_MARKET_QUEUE },
      { name: CANDIDATE_ANALYSIS_QUEUE },
      { name: EVENING_QUEUE },
    ),
    TypeOrmModule.forFeature([DailyPipelineRun]),
    InstrumentsModule,
    MarketDataModule,
    ScannerModule,
    CandidatesModule,
    NewsModule,
    AiAnalysisModule,
    MessagingModule,
    TradeMonitorModule,
    DailySummaryModule,
  ],
  controllers: [JobsController],
  providers: [
    TradingDayService,
    JobOrchestrationService,
    DailyPipelineService,
    CandidateAnalysisService,
    EveningService,
    TradingDayScheduler,
    TradeMonitorProcessor,
    PostMarketProcessor,
    CandidateAnalysisProcessor,
    EveningProcessor,
  ],
  exports: [BullModule, JobOrchestrationService, DailyPipelineService],
})
export class JobsModule {}
