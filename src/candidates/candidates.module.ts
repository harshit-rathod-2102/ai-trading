import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradeCandidate } from './entities/trade-candidate.entity';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { TradesModule } from '../trades/trades.module';
import { JournalModule } from '../journal/journal.module';
import { RiskModule } from '../risk/risk.module';
import { ScanResultRecord } from '../scanner/entities/scan-result.entity';
import { CandidateOrchestrationService } from './candidate-orchestration.service';
import { NewsModule } from '../news/news.module';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { Instrument } from '../instruments/entities/instrument.entity';
import { CandidateDecisionService } from './candidate-decision.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TradeCandidate, ScanResultRecord, Instrument]),
    TradesModule,
    JournalModule,
    RiskModule,
    NewsModule,
    AiAnalysisModule,
  ],
  controllers: [CandidatesController],
  providers: [CandidatesService, CandidateOrchestrationService, CandidateDecisionService],
  exports: [CandidatesService, CandidateOrchestrationService, CandidateDecisionService],
})
export class CandidatesModule {}
