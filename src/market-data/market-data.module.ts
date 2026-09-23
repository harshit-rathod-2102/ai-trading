import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstrumentsModule } from '../instruments/instruments.module';
import { DailyCandle } from './entities/daily-candle.entity';
import { MARKET_DATA_PROVIDER } from '../providers/market-data/market-data-provider.token';
import { FixtureMarketDataProvider } from './providers/fixture-market-data.provider';
import { MarketDataProvider } from '../providers/market-data/market-data-provider.interface';
import { UpstoxClient } from '../providers/market-data/upstox/upstox-client';
import { UpstoxMarketDataProvider } from '../providers/market-data/upstox/upstox-market-data.provider';
import { UpstoxAuthModule } from '../providers/upstox/auth/upstox-auth.module';
import { MarketDataService } from './market-data.service';
import { DataQualityService } from './data-quality.service';
import { MarketDataController } from './market-data.controller';
import { MARKET_DATA_QUEUE, MarketDataJobs, MarketDataWorker } from './market-data.jobs';

@Module({
  imports: [
    InstrumentsModule,
    UpstoxAuthModule,
    TypeOrmModule.forFeature([DailyCandle]),
    BullModule.registerQueue({ name: MARKET_DATA_QUEUE }),
  ],
  controllers: [MarketDataController],
  providers: [
    FixtureMarketDataProvider,
    UpstoxClient,
    UpstoxMarketDataProvider,
    {
      provide: MARKET_DATA_PROVIDER,
      inject: [ConfigService, FixtureMarketDataProvider, UpstoxMarketDataProvider],
      useFactory: (
        config: ConfigService,
        fixture: FixtureMarketDataProvider,
        upstox: UpstoxMarketDataProvider,
      ): MarketDataProvider => {
        const selected = config.getOrThrow<string>('providers.marketData');
        if (selected === 'upstox') return upstox;
        if (selected === 'fixture') {
          if (config.getOrThrow<string>('app.nodeEnv') === 'production') {
            throw new Error('Fixture market data is for development only');
          }
          return fixture;
        }
        throw new Error(`Unsupported market-data provider: ${selected}`);
      },
    },
    MarketDataService,
    DataQualityService,
    MarketDataJobs,
    MarketDataWorker,
  ],
  exports: [MarketDataService, UpstoxAuthModule],
})
export class MarketDataModule {}
