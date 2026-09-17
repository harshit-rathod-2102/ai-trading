import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_ROUTING_V1_CONFIG as config } from './config/ai-routing-v1.config';
import { AiAnalysisTier } from './models/ai-analysis-tier.enum';
import { AiRoutingDecision } from './models/ai-routing-decision.model';
import { EscalationReason } from './models/escalation-reason.enum';
import { FastTriageResult, TriageRiskLevel } from './models/fast-triage-result.model';

export interface AiRoutingContext {
  readonly strategyRank: number;
  readonly globalRank: number;
}

@Injectable()
export class AiRoutingPolicy {
  constructor(private readonly configuration: ConfigService) {}

  decide(
    analysis: FastTriageResult,
    context: AiRoutingContext,
    decidedAt = new Date(),
  ): AiRoutingDecision {
    const reasons: EscalationReason[] = [];
    const topRankThreshold = this.configuration.getOrThrow<number>('aiRouting.topRankThreshold');

    if (config.highEventRiskAlwaysDeep && analysis.eventRisk === TriageRiskLevel.HIGH) {
      reasons.push(EscalationReason.HIGH_EVENT_RISK);
    }
    if (config.highUncertaintyAlwaysDeep && analysis.uncertainty === TriageRiskLevel.HIGH) {
      reasons.push(EscalationReason.HIGH_UNCERTAINTY);
    }
    if (Number(analysis.confidence) < config.minimumFastConfidence) {
      reasons.push(EscalationReason.LOW_MODEL_CONFIDENCE);
    }
    if (config.contradictionAlwaysDeep && analysis.contradictions.length > 0) {
      reasons.push(EscalationReason.CONTRADICTORY_EVIDENCE);
    }
    if (config.missingEvidenceAlwaysDeep && analysis.missingEvidence.length > 0) {
      reasons.push(EscalationReason.MISSING_CRITICAL_EVIDENCE);
    }
    if (config.modelSuggestionAlwaysDeep && analysis.requiresDeepReviewSuggested) {
      reasons.push(EscalationReason.MODEL_REQUESTED_ESCALATION);
    }
    if (context.strategyRank <= topRankThreshold || context.globalRank <= topRankThreshold) {
      reasons.push(EscalationReason.TOP_RANKED_CANDIDATE);
    }

    const escalate = reasons.length > 0;
    return {
      version: config.version,
      escalate,
      reasons,
      tierSelected: escalate ? AiAnalysisTier.DEEP : AiAnalysisTier.FAST,
      decidedAt: decidedAt.toISOString(),
      topRankThreshold,
    };
  }
}
