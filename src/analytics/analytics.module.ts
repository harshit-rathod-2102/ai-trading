import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradeCandidate } from '../candidates/entities/trade-candidate.entity';
import { TradeEvent } from '../journal/entities/trade-event.entity';
import { ScanResultRecord } from '../scanner/entities/scan-result.entity';
import { Trade } from '../trades/entities/trade.entity';
import { AnalyticsCalculationService } from './analytics-calculation.service';
import { AnalyticsQueryService } from './analytics-query.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [TypeOrmModule.forFeature([Trade, TradeEvent, TradeCandidate, ScanResultRecord])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsQueryService, AnalyticsCalculationService],
  exports: [AnalyticsService, AnalyticsCalculationService],
})
export class AnalyticsModule {}
