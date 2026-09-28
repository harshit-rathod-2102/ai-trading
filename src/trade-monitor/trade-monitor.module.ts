import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstrumentsModule } from '../instruments/instruments.module';
import { TradeEvent } from '../journal/entities/trade-event.entity';
import { JournalModule } from '../journal/journal.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { MessagingModule } from '../messaging/messaging.module';
import { Trade } from '../trades/entities/trade.entity';
import { TradeMonitorAlertService } from './trade-monitor-alert.service';
import { TradeMonitorController } from './trade-monitor.controller';
import { TradeMonitorService } from './trade-monitor.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trade, TradeEvent]),
    InstrumentsModule,
    MarketDataModule,
    MessagingModule,
    JournalModule,
  ],
  controllers: [TradeMonitorController],
  providers: [TradeMonitorService, TradeMonitorAlertService],
  exports: [TradeMonitorService],
})
export class TradeMonitorModule {}
