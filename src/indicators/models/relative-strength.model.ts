export interface RelativeStrengthResult {
  readonly period: number;
  readonly stockReturnPercent: string;
  readonly benchmarkReturnPercent: string;
  readonly excessReturnPercent: string;
  readonly currentPriceRatio: string;
  readonly priceRatioChangePercent: string;
}
