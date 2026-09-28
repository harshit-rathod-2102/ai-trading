export const TRADE_MONITOR_VERSION = 'trade-monitor-v1';

export const tradeMonitorV1Config = Object.freeze({
  version: TRADE_MONITOR_VERSION,
  plusOneR: '1',
  plusTwoR: '2',
  stopProximityR: '0.25',
  adverseMoveAlertR: '-0.5',
  maxPriceAgeMs: 2 * 60 * 1000,
  maxFuturePriceSkewMs: 30 * 1000,
  alertClaimTtlMs: 5 * 60 * 1000,
  enableTrendDeterioration: false,
});
