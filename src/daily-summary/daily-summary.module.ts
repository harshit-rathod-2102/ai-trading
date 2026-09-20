import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradeCandidate } from '../candidates/entities/trade-candidate.entity';
import { DailyPipelineRun } from '../jobs/entities/daily-pipeline-run.entity';
import { TradeEvent } from '../journal/entities/trade-event.entity';
import { MarketRegimeSnapshot } from '../market-regime/entities/market-regime-snapshot.entity';
import { MessagingModule } from '../messaging/messaging.module';
import { RiskModule } from '../risk/risk.module';
import { ScanRun } from '../scanner/entities/scan-run.entity';
import { Trade } from '../trades/entities/trade.entity';
import { TradingProfileModule } from '../trading-profile/trading-profile.module';
import { DailySummaryController } from './daily-summary.controller';
import { DailySummaryMessageBuilder } from './daily-summary-message.builder';
import { DailySummaryService } from './daily-summary.service';
import { DailySummaryRecord } from './entities/daily-summary.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DailySummaryRecord, DailyPipelineRun, MarketRegimeSnapshot, ScanRun,
      TradeCandidate, Trade, TradeEvent,
    ]),
    TradingProfileModule,
    RiskModule,
    MessagingModule,
  ],
  controllers: [DailySummaryController],
  providers: [DailySummaryService, DailySummaryMessageBuilder],
  exports: [DailySummaryService, DailySummaryMessageBuilder],
})
export class DailySummaryModule {}
