import { fixed, positiveMonitorDecimal } from './numeric';

export interface TradePnl {
  readonly unrealizedPnl: string;
  readonly unrealizedPnlPercent: string;
}

export function calculateTradePnl(currentPrice: string, actualEntry: string, quantity: number): TradePnl {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new RangeError('quantity must be positive');
  const current = positiveMonitorDecimal(currentPrice, 'currentPrice');
  const entry = positiveMonitorDecimal(actualEntry, 'actualEntry');
  return {
    unrealizedPnl: fixed(current.minus(entry).times(quantity)),
    unrealizedPnlPercent: fixed(current.div(entry).minus(1).times(100)),
  };
}
