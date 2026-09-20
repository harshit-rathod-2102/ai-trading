import { TradeAlertDeliveryStatus, TradeAlertSeverity, TradeAlertType } from './trade-alert-type.enum';

export interface TradeMonitorAlert {
  readonly eventId: string;
  readonly type: TradeAlertType;
  readonly severity: TradeAlertSeverity;
  readonly isNew: boolean;
  readonly deliveryStatus: TradeAlertDeliveryStatus;
  readonly providerMessageId: string | null;
}

export interface TradeMonitorResult {
  readonly monitorVersion: string;
  readonly tradeId: string;
  readonly symbol: string;
  readonly provider: string;
  readonly providerObservedAt: string;
  readonly price: string;
  readonly previousPrice: string | null;
  readonly quantity: number;
  readonly actualEntry: string;
  readonly initialStop: string;
  readonly currentStop: string;
  readonly target1: string | null;
  readonly target2: string | null;
  readonly unrealizedPnl: string;
  readonly unrealizedPnlPercent: string;
  readonly currentR: string;
  readonly maxFavorablePrice: string;
  readonly maxFavorableR: string;
  readonly maxAdversePrice: string;
  readonly maxAdverseR: string;
  readonly stopDistance: string;
  readonly stopDistancePercent: string;
  readonly stopDistanceR: string;
  readonly target1Distance: string | null;
  readonly target1DistancePercent: string | null;
  readonly target2Distance: string | null;
  readonly target2DistancePercent: string | null;
  readonly holdingDurationSeconds: number;
  readonly alerts: readonly TradeMonitorAlert[];
  readonly monitoredAt: string;
}

export interface TradeMonitorFailure {
  readonly tradeId: string;
  readonly symbol: string;
  readonly errorCode: string;
  readonly message: string;
}

export interface TradeMonitorBatchResult {
  readonly totalOpenTrades: number;
  readonly monitored: number;
  readonly failed: number;
  readonly alertsGenerated: number;
  readonly alertsSent: number;
  readonly alertDeliveryFailures: number;
  readonly failures: readonly TradeMonitorFailure[];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
}
