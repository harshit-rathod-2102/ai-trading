export interface ProviderCandle {
  /** ISO-8601 timestamp identifying the provider's candle boundary. */
  readonly timestamp: string;
  /** Exchange-local session date in YYYY-MM-DD form for daily bars. */
  readonly sessionDate: string;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string | null;
  readonly adjustedClose: string | null;
}
