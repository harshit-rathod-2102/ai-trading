import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradeEvent } from './entities/trade-event.entity';
import { JournalService } from './journal.service';

@Module({
  imports: [TypeOrmModule.forFeature([TradeEvent])],
  providers: [JournalService],
  exports: [JournalService],
})
export class JournalModule {}
