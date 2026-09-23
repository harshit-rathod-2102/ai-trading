export interface LatestMarketPrice {
  readonly instrumentId: string;
  readonly symbol: string;
  readonly price: string;
  readonly observedAt: string;
  readonly provider: string;
  readonly isSynthetic: boolean;
}
