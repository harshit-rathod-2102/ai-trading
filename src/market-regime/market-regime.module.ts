import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndicatorsModule } from '../indicators/indicators.module';
import { InstrumentsModule } from '../instruments/instruments.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { MarketRegimeSnapshot } from './entities/market-regime-snapshot.entity';
import { MarketRegimeController } from './market-regime.controller';
import { MarketRegimeService } from './market-regime.service';

@Module({
  imports: [
    IndicatorsModule,
    InstrumentsModule,
    MarketDataModule,
    TypeOrmModule.forFeature([MarketRegimeSnapshot]),
  ],
  controllers: [MarketRegimeController],
  providers: [MarketRegimeService],
  exports: [MarketRegimeService],
})
export class MarketRegimeModule {}
