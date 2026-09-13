import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradeCandidate } from './entities/trade-candidate.entity';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { TradesModule } from '../trades/trades.module';
import { JournalModule } from '../journal/journal.module';

@Module({
  imports: [TypeOrmModule.forFeature([TradeCandidate]), TradesModule, JournalModule],
  controllers: [CandidatesController],
  providers: [CandidatesService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
