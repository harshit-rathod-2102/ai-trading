import { fixed, positiveMonitorDecimal } from './numeric';
import { initialRiskPerShare } from './trade-r-multiple';

export interface TradeDistances {
  readonly stopDistance: string;
  readonly stopDistancePercent: string;
  readonly stopDistanceR: string;
  readonly target1Distance: string | null;
  readonly target1DistancePercent: string | null;
  readonly target2Distance: string | null;
  readonly target2DistancePercent: string | null;
}

export function calculateTradeDistances(
  currentPrice: string,
  currentStop: string,
  actualEntry: string,
  initialStop: string,
  target1: string | null,
  target2: string | null,
): TradeDistances {
  const current = positiveMonitorDecimal(currentPrice, 'currentPrice');
  const stop = positiveMonitorDecimal(currentStop, 'currentStop');
  const risk = initialRiskPerShare(actualEntry, initialStop);
  const targetDistance = (target: string | null) => {
    if (!target) return { distance: null, percent: null };
    const value = positiveMonitorDecimal(target, 'target');
    return {
      distance: fixed(value.minus(current)),
      percent: fixed(value.minus(current).div(current).times(100)),
    };
  };
  const first = targetDistance(target1);
  const second = targetDistance(target2);
  return {
    stopDistance: fixed(current.minus(stop)),
    stopDistancePercent: fixed(current.div(stop).minus(1).times(100)),
    stopDistanceR: fixed(current.minus(stop).div(risk)),
    target1Distance: first.distance,
    target1DistancePercent: first.percent,
    target2Distance: second.distance,
    target2DistancePercent: second.percent,
  };
}
