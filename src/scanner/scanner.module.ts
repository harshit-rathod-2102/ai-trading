import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndicatorsModule } from '../indicators/indicators.module';
import { InstrumentsModule } from '../instruments/instruments.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { MarketRegimeModule } from '../market-regime/market-regime.module';
import { StrategyModule } from '../strategy/strategy.module';
import { ScanResultRecord } from './entities/scan-result.entity';
import { ScanRun } from './entities/scan-run.entity';
import { CrossSectionalRanking } from './ranking/cross-sectional-ranking';
import { ScannerController } from './scanner.controller';
import { ScannerEvaluationService } from './scanner-evaluation.service';
import { ScannerService } from './scanner.service';

@Module({
  imports: [
    IndicatorsModule,
    InstrumentsModule,
    MarketDataModule,
    MarketRegimeModule,
    StrategyModule,
    TypeOrmModule.forFeature([ScanRun, ScanResultRecord]),
  ],
  controllers: [ScannerController],
  providers: [ScannerService, ScannerEvaluationService, CrossSectionalRanking],
  exports: [ScannerService, ScannerEvaluationService, CrossSectionalRanking],
})
export class ScannerModule {}
