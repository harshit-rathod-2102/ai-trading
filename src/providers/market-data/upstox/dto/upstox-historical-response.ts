export type UpstoxCandleTuple = readonly unknown[];

export interface UpstoxHistoricalResponse {
  readonly status?: unknown;
  readonly data?: {
    readonly candles?: unknown;
  };
}
