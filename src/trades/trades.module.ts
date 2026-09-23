import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trade } from './entities/trade.entity';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';
import { JournalModule } from '../journal/journal.module';

@Module({
  imports: [TypeOrmModule.forFeature([Trade]), JournalModule],
  controllers: [TradesController],
  providers: [TradesService],
  exports: [TradesService],
})
export class TradesModule {}
