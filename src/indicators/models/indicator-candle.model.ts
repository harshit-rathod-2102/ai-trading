export interface IndicatorCandle {
  readonly timestamp: Date;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string | null;
}
