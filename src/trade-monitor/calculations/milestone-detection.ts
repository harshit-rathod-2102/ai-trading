import { TradeEventType } from '../../common/enums/trade-event-type.enum';
import { TradeAlertSeverity, TradeAlertType } from '../models/trade-alert-type.enum';
import { monitorDecimal, positiveMonitorDecimal } from './numeric';

export interface AlertThresholds {
  readonly plusOneR: string;
  readonly plusTwoR: string;
  readonly stopProximityR: string;
  readonly adverseMoveAlertR: string;
}

export interface MilestoneInput {
  readonly currentPrice: string;
  readonly currentStop: string;
  readonly currentR: string;
  readonly stopDistanceR: string;
  readonly target1: string | null;
  readonly target2: string | null;
}

export interface DetectedTradeAlert {
  readonly type: TradeAlertType;
  readonly severity: TradeAlertSeverity;
  readonly eventType: TradeEventType;
}

export function detectTradeAlerts(
  input: MilestoneInput,
  thresholds: AlertThresholds,
): readonly DetectedTradeAlert[] {
  const price = positiveMonitorDecimal(input.currentPrice, 'currentPrice');
  const stop = positiveMonitorDecimal(input.currentStop, 'currentStop');
  const currentR = monitorDecimal(input.currentR, 'currentR');
  const stopDistanceR = monitorDecimal(input.stopDistanceR, 'stopDistanceR');
  const alerts: DetectedTradeAlert[] = [];

  if (currentR.gte(thresholds.plusOneR))
    alerts.push({
      type: TradeAlertType.PLUS_1R,
      severity: TradeAlertSeverity.INFO,
      eventType: TradeEventType.PRICE_MILESTONE_REACHED,
    });
  if (currentR.gte(thresholds.plusTwoR))
    alerts.push({
      type: TradeAlertType.PLUS_2R,
      severity: TradeAlertSeverity.INFO,
      eventType: TradeEventType.PRICE_MILESTONE_REACHED,
    });
  if (input.target1 && price.gte(positiveMonitorDecimal(input.target1, 'target1')))
    alerts.push({
      type: TradeAlertType.TARGET1_REACHED,
      severity: TradeAlertSeverity.INFO,
      eventType: TradeEventType.TARGET1_REACHED,
    });
  if (input.target2 && price.gte(positiveMonitorDecimal(input.target2, 'target2')))
    alerts.push({
      type: TradeAlertType.TARGET2_REACHED,
      severity: TradeAlertSeverity.INFO,
      eventType: TradeEventType.TARGET2_REACHED,
    });

  if (price.lte(stop)) {
    alerts.push({
      type: TradeAlertType.STOP_BREACHED,
      severity: TradeAlertSeverity.CRITICAL,
      eventType: TradeEventType.STOP_BREACHED_OBSERVED,
    });
  } else if (stopDistanceR.lte(thresholds.stopProximityR)) {
    alerts.push({
      type: TradeAlertType.STOP_PROXIMITY,
      severity: TradeAlertSeverity.WARNING,
      eventType: TradeEventType.STOP_PROXIMITY_OBSERVED,
    });
  } else if (currentR.lte(thresholds.adverseMoveAlertR)) {
    alerts.push({
      type: TradeAlertType.ADVERSE_MOVE,
      severity: TradeAlertSeverity.WARNING,
      eventType: TradeEventType.ADVERSE_MOVE_OBSERVED,
    });
  }

  return alerts;
}
