import { Injectable } from '@nestjs/common';
import { IndicatorsService } from '../indicators/indicators.service';
import { StrategyService } from '../strategy/strategy.service';
import { SCANNER_V1_CONFIG as config } from './config/scanner-v1.config';
import { UniverseEvaluationInput } from './models/scan-request.model';
import { QualifiedSetup, ScanExclusion, UniverseEvaluationResult } from './models/scan-result.model';

@Injectable()
export class ScannerEvaluationService {
  constructor(private readonly indicators: IndicatorsService, private readonly strategies: StrategyService) {}

  evaluate(input: UniverseEvaluationInput): UniverseEvaluationResult {
    this.validateSharedContext(input);
    const qualifiedSetups: QualifiedSetup[] = [];
    const exclusions: ScanExclusion[] = [];
    let eligibleUniverse = 0;
    let evaluatedSymbols = 0;

    for (const item of input.instruments) {
      if (item.candles.length < config.minimumHistory) {
        exclusions.push({ instrumentId: item.instrument.id, symbol: item.instrument.symbol,
          code: 'INSUFFICIENT_HISTORY',
          message: `Requires at least ${config.minimumHistory} finalized sessions; found ${item.candles.length}` });
        continue;
      }
      let markedEligible = false;
      try {
        const technicalSnapshot = this.indicators.calculateTechnicalSnapshot(item.candles, input.benchmarkCandles);
        eligibleUniverse++;
        markedEligible = true;
        const results = this.strategies.evaluateAll({
          instrument: { symbol: item.instrument.symbol, exchange: item.instrument.exchange,
            sector: item.instrument.sector },
          candles: item.candles,
          indicators: technicalSnapshot,
          marketRegime: input.marketRegime,
          evaluatedAt: input.evaluatedAt,
        });
        if (results.length > 0 && results.every(result => result.rejectionCodes.includes('INVALID_DATA'))) {
          throw new RangeError(results.flatMap(result => result.rejectionReasons).join('; '));
        }
        evaluatedSymbols++;
        for (const result of results) {
          if (!result.qualified) continue;
          qualifiedSetups.push({
            instrumentId: item.instrument.id,
            symbol: item.instrument.symbol,
            exchange: item.instrument.exchange,
            sector: item.instrument.sector,
            strategy: result.strategy,
            strategyVersion: result.strategyVersion,
            strategyScore: result.score,
            strategyResult: result,
            technicalSnapshot,
            marketRegime: input.marketRegime,
          });
        }
      } catch (error: unknown) {
        if (markedEligible) eligibleUniverse--;
        exclusions.push({ instrumentId: item.instrument.id, symbol: item.instrument.symbol,
          code: 'INVALID_DATA', message: this.message(error) });
      }
    }
    return { eligibleUniverse, evaluatedSymbols, qualifiedSetups, exclusions };
  }

  private validateSharedContext(input: UniverseEvaluationInput): void {
    if (input.benchmarkCandles.length < config.minimumHistory) {
      throw new RangeError(`NIFTY benchmark requires at least ${config.minimumHistory} finalized sessions`);
    }
    const snapshot = this.indicators.calculateTechnicalSnapshot(input.benchmarkCandles);
    const benchmarkDate = snapshot.asOf?.slice(0, 10);
    if (!snapshot.sma200 || benchmarkDate !== input.marketRegime.marketDate) {
      throw new RangeError(
        `NIFTY benchmark is not usable for regime date ${input.marketRegime.marketDate}; latest=${benchmarkDate ?? 'none'}`,
      );
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown symbol evaluation failure';
  }
}
