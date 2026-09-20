import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstrumentsModule } from '../instruments/instruments.module';
import { ScannerModule } from '../scanner/scanner.module';
import { Trade } from '../trades/entities/trade.entity';
import { TradingProfileModule } from '../trading-profile/trading-profile.module';
import { PortfolioRiskReaderService } from './portfolio-risk-reader.service';
import { RiskCalculatorService } from './risk-calculator.service';
import { RiskController } from './risk.controller';
import { RiskService } from './risk.service';

@Module({
  imports: [TradingProfileModule, ScannerModule, InstrumentsModule, TypeOrmModule.forFeature([Trade])],
  controllers: [RiskController],
  providers: [RiskService, RiskCalculatorService, PortfolioRiskReaderService],
  exports: [RiskService, RiskCalculatorService, PortfolioRiskReaderService],
})
export class RiskModule {}
