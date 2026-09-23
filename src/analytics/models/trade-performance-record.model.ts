export type RealizedPnlSource = 'EXIT_EVENTS' | 'TRADE_RECORD';

export interface TradePerformanceRecord {
  readonly tradeId: string;
  readonly candidateId: string | null;
  readonly symbol: string;
  readonly sector: string | null;
  readonly strategy: string;
  readonly strategyVersion: string;
  readonly marketRegime: string | null;
  readonly openedAt: Date;
  readonly closedAt: Date;
  readonly initialQuantity: number;
  readonly entryPrice: string;
  readonly initialStop: string;
  readonly initialRiskPerShare: string | null;
  readonly initialRiskAmount: string | null;
  readonly realizedPnl: string;
  readonly realizedPnlSource: RealizedPnlSource;
  readonly realizedR: string | null;
  readonly mfeR: string | null;
  readonly maeR: string | null;
  readonly holdingMinutes: number;
  readonly quantScore: string | null;
  readonly globalRank: number | null;
  readonly strategyRank: number | null;
  readonly warnings: readonly string[];
}
