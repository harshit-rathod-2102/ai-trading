import { Module } from '@nestjs/common';
import { StrategyService } from './strategy.service';
import { MomentumBreakoutStrategy } from './momentum-breakout/momentum-breakout.strategy';
import { TrendPullbackStrategy } from './trend-pullback/trend-pullback.strategy';

@Module({
  providers: [StrategyService, MomentumBreakoutStrategy, TrendPullbackStrategy],
  exports: [StrategyService],
})
export class StrategyModule {}
