export enum TradeAlertType {
  PLUS_1R = 'PLUS_1R',
  PLUS_2R = 'PLUS_2R',
  ADVERSE_MOVE = 'ADVERSE_MOVE',
  STOP_PROXIMITY = 'STOP_PROXIMITY',
  STOP_BREACHED = 'STOP_BREACHED',
  TARGET1_REACHED = 'TARGET1_REACHED',
  TARGET2_REACHED = 'TARGET2_REACHED',
}

export enum TradeAlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export enum TradeAlertDeliveryStatus {
  SENT = 'SENT',
  FAILED = 'FAILED',
}
