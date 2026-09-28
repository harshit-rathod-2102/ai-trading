import { StrategyName } from '../models/strategy-name.enum';
import { StrategyInput } from './strategy-input.model';
import { StrategyResult } from './strategy-result.model';

export interface TradingStrategy {
  readonly name: StrategyName;
  readonly version: string;
  evaluate(input: StrategyInput): StrategyResult;
}
