import { DailyPipelineStatus } from '../../jobs/models/job-data.model';

export const DAILY_SUMMARY_VERSION = 'daily-summary-v1';

export type SummaryScanStatus = 'SUCCESS' | 'FAILED' | 'UNAVAILABLE';
export type TradePriceStatus = 'CURRENT' | 'STALE' | 'UNAVAILABLE';

export interface DailyCandidateSummaryItem {
  readonly candidateId: string;
  readonly symbol: string;
  readonly strategy: string;
  readonly globalRank: number | null;
  readonly rankingScore: string | null;
  readonly plannedEntry: string;
  readonly stop: string;
  readonly quantity: number;
  readonly plannedRisk: string | null;
  readonly aiSummary: string | null;
  readonly primaryRisk: string | null;
  readonly notificationStatus: 'SENT' | 'PENDING' | 'NOT_SENT' | 'NOT_APPLICABLE';
  readonly currentStatus: string;
}

export interface DailyTradeSummaryItem {
  readonly tradeId: string;
  readonly symbol: string;
  readonly quantity: number;
  readonly entry: string;
  readonly currentPrice: string | null;
  readonly currentStop: string;
  readonly currentR: string | null;
  readonly unrealizedPnl: string | null;
  readonly priceStatus: TradePriceStatus;
  readonly priceObservedAt: string | null;
}

export interface DailySummary {
  readonly version: typeof DAILY_SUMMARY_VERSION;
  readonly marketDate: string;
  readonly pipeline: {
    readonly status: DailyPipelineStatus | 'UNAVAILABLE';
    readonly runId: string | null;
    readonly failedAnalysisCount: number;
  };
  readonly market: {
    readonly regime: string | null;
    readonly score: string | null;
    readonly confidence: string | null;
  };
  readonly scan: {
    readonly status: SummaryScanStatus;
    readonly runId: string | null;
    readonly totalUniverse: number | null;
    readonly evaluatedSymbols: number | null;
    readonly qualifiedSetups: number | null;
    readonly shortlistedSetups: number | null;
  };
  readonly candidates: {
    readonly qualifiedCount: number;
    readonly qualified: readonly DailyCandidateSummaryItem[];
    readonly waitCount: number;
    readonly rejectedCount: number;
    readonly failedAnalysisCount: number;
  };
  readonly portfolio: {
    readonly openTrades: number;
    readonly currentPositionValue: string | null;
    readonly unrealizedPnl: string | null;
    readonly realizedPnlToday: string | null;
    readonly openRisk: string | null;
    readonly maxPortfolioRisk: string | null;
    readonly stalePriceCount: number;
    readonly unavailablePriceCount: number;
  };
  readonly trades: readonly DailyTradeSummaryItem[];
  readonly warnings: readonly string[];
  readonly generatedAt: Date;
}

export type DailySummarySnapshot = Omit<DailySummary, 'generatedAt'> & { readonly generatedAt: string };
