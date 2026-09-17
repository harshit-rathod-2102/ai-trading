import { Injectable, Logger } from '@nestjs/common';
import { StrategyInput } from './contracts/strategy-input.model';
import { StrategyResult } from './contracts/strategy-result.model';
import { StrategyName } from './models/strategy-name.enum';
import { MomentumBreakoutStrategy } from './momentum-breakout/momentum-breakout.strategy';
import { MOMENTUM_BREAKOUT_V1_CONFIG } from './momentum-breakout/momentum-breakout-v1.config';
import { TrendPullbackStrategy } from './trend-pullback/trend-pullback.strategy';
import { TREND_PULLBACK_V1_CONFIG } from './trend-pullback/trend-pullback-v1.config';

@Injectable()
export class StrategyService {
  private readonly logger = new Logger(StrategyService.name);
  constructor(private readonly breakout: MomentumBreakoutStrategy, private readonly pullback: TrendPullbackStrategy) {}

  evaluateMomentumBreakout(input: StrategyInput): StrategyResult { return this.breakout.evaluate(input); }
  evaluateTrendPullback(input: StrategyInput): StrategyResult { return this.pullback.evaluate(input); }

  evaluate(strategy: StrategyName, input: StrategyInput): StrategyResult {
    const startedAt = performance.now();
    let result: StrategyResult;
    switch (strategy) {
      case StrategyName.MOMENTUM_BREAKOUT: result = this.evaluateMomentumBreakout(input); break;
      case StrategyName.TREND_PULLBACK: result = this.evaluateTrendPullback(input); break;
      default: throw new RangeError(`Unknown strategy: ${strategy}`);
    }
    this.logResult(input, result, startedAt);
    return result;
  }

  /** Stable configuration order; returns both hypotheses, without ranking or deduplication. */
  evaluateAll(input: StrategyInput): StrategyResult[] {
    const results: StrategyResult[] = [];
    if (MOMENTUM_BREAKOUT_V1_CONFIG.enabled) {
      const startedAt = performance.now();
      const result = this.evaluateMomentumBreakout(input);
      this.logResult(input, result, startedAt);
      results.push(result);
    }
    if (TREND_PULLBACK_V1_CONFIG.enabled) {
      const startedAt = performance.now();
      const result = this.evaluateTrendPullback(input);
      this.logResult(input, result, startedAt);
      results.push(result);
    }
    return results;
  }

  private logResult(input: StrategyInput, result: StrategyResult, startedAt: number): void {
    this.logger.debug({ event: 'strategy.evaluated', module: StrategyService.name,
      operation: 'evaluate', symbol: input.instrument.symbol, strategy: result.strategy,
      strategyVersion: result.strategyVersion, qualified: result.qualified, score: result.score,
      rejectionCodes: result.rejectionCodes, durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      status: 'completed' }, 'Strategy evaluated');
  }
}
