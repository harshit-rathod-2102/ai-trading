import { Module } from '@nestjs/common';
import { ProvidersModule } from './providers/providers.module';
import { InstrumentsModule } from './instruments/instruments.module';
import { MarketDataModule } from './market-data/market-data.module';
import { CandidatesModule } from './candidates/candidates.module';
import { TradesModule } from './trades/trades.module';
import { JournalModule } from './journal/journal.module';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { RedisModule } from './redis/redis.module';
import { NewsModule } from './news/news.module';
import { AiAnalysisModule } from './ai-analysis/ai-analysis.module';
import { MessagingModule } from './messaging/messaging.module';

@Module({
  imports: [
    AppConfigModule,
    ProvidersModule,
    DatabaseModule,
    RedisModule,
    JobsModule,
    HealthModule,
    CandidatesModule,
    TradesModule,
    JournalModule,
    InstrumentsModule,
    MarketDataModule,
    NewsModule,
    AiAnalysisModule,
    MessagingModule,
  ],
})
export class AppModule {}
