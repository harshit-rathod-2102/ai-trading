export interface TradePriceSnapshot {
  readonly price: string;
  readonly observedAt: string;
  readonly provider: string;
  readonly isSynthetic: boolean;
}
