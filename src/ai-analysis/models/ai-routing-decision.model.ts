import { AiAnalysisTier } from './ai-analysis-tier.enum';
import { EscalationReason } from './escalation-reason.enum';

export interface AiRoutingDecision {
  readonly version: string;
  readonly escalate: boolean;
  readonly reasons: readonly EscalationReason[];
  readonly tierSelected: AiAnalysisTier;
  readonly decidedAt: string;
  readonly topRankThreshold: number;
}
