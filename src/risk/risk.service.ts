import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ScannerService } from '../scanner/scanner.service';
import { ScanResultRecord } from '../scanner/entities/scan-result.entity';
import { TradingProfileService } from '../trading-profile/trading-profile.service';
import { TradingProfile } from '../trading-profile/entities/trading-profile.entity';
import { RiskSetup } from './models/risk-plan-input.model';
import { RiskPlanResult } from './models/risk-plan-result.model';
import { PortfolioRiskReaderService } from './portfolio-risk-reader.service';
import { RiskCalculatorService } from './risk-calculator.service';
import { elapsedMilliseconds, structuredError } from '../logging/logging.utils';

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);
  constructor(
    private readonly scanner: ScannerService,
    private readonly profiles: TradingProfileService,
    private readonly portfolio: PortfolioRiskReaderService,
    private readonly calculator: RiskCalculatorService,
  ) {}

  async evaluateScannerResult(scanResultId: string, evaluatedAt = new Date()): Promise<RiskPlanResult> {
    const record = await this.scanner.getResult(scanResultId);
    return this.buildRiskPlan(this.toRiskSetup(record), evaluatedAt);
  }

  async buildRiskPlan(setup: RiskSetup, evaluatedAt = new Date()): Promise<RiskPlanResult> {
    const startedAt = performance.now();
    try {
      const profile = await this.activeProfileOrNull();
      const openTrades = profile ? await this.portfolio.loadOpenTrades() : [];
      const result = this.calculator.calculate({ setup, tradingProfile: profile, openTrades, evaluatedAt });
      const fields = { event: 'risk.evaluated', module: RiskService.name, operation: 'buildRiskPlan',
        scanResultId: setup.scanResultId, symbol: setup.symbol, strategy: setup.strategy,
        accepted: result.accepted, status: result.accepted ? 'accepted' : 'rejected',
        recommendedQuantity: result.recommendedQuantity, rejectionCodes: result.rejectionCodes,
        durationMs: elapsedMilliseconds(startedAt) };
      if (result.accepted) this.logger.log(fields, 'Risk plan accepted');
      else this.logger.debug(fields, 'Risk plan rejected');
      return result;
    } catch (error: unknown) {
      this.logger.error({ event: 'risk.failed', module: RiskService.name, operation: 'buildRiskPlan',
        scanResultId: setup.scanResultId, symbol: setup.symbol, strategy: setup.strategy,
        durationMs: elapsedMilliseconds(startedAt), ...structuredError(error) }, 'Risk evaluation failed');
      throw error;
    }
  }

  private async activeProfileOrNull(): Promise<TradingProfile | null> {
    try {
      return await this.profiles.getActiveProfile();
    } catch (error: unknown) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  private toRiskSetup(record: ScanResultRecord): RiskSetup {
    return {
      scanResultId: record.id, instrumentId: record.instrumentId, symbol: record.symbol,
      exchange: record.exchange, sector: record.sector, strategy: record.strategy,
      strategyVersion: record.strategyVersion, strategyScore: record.strategyScore,
      rankingScore: record.rankingScore, strategyRank: record.strategyRank, globalRank: record.globalRank,
      technicalSnapshot: record.technicalSnapshot, strategyResult: record.strategyResult,
    };
  }
}
