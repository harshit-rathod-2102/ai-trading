import { Module } from '@nestjs/common';
import { TradingProfileModule } from './trading-profile/trading-profile.module';
import { IndicatorsModule } from './indicators/indicators.module';
import { MarketRegimeModule } from './market-regime/market-regime.module';
import { StrategyModule } from './strategy/strategy.module';
import { ScannerModule } from './scanner/scanner.module';
import { RiskModule } from './risk/risk.module';
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
import { LoggingModule } from './logging/logging.module';

@Module({
  imports: [
    TradingProfileModule,
    IndicatorsModule,
    MarketRegimeModule,
    StrategyModule,
    ScannerModule,
    RiskModule,
    AppConfigModule,
    LoggingModule,
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
