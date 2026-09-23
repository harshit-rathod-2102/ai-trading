import { TradeDistances } from '../calculations/trade-distances';
import { ExcursionResult } from '../calculations/excursion';
import { TradePnl } from '../calculations/trade-pnl';

export interface TradeMonitorState extends TradePnl, ExcursionResult, TradeDistances {
  readonly currentR: string;
  readonly holdingDurationSeconds: number;
}
