import { createHash } from 'node:crypto';
import { TradeCandidate } from '../candidates/entities/trade-candidate.entity';
import { AiRoutingDecision } from './models/ai-routing-decision.model';
import { FastTriageResult } from './models/fast-triage-result.model';

export function fastEvidenceHash(
  candidate: TradeCandidate,
  companyName: string,
  promptVersion: string,
): string {
  return sha256({
    ...candidateEvidence(candidate, companyName),
    promptVersion,
  });
}

export function deepEvidenceHash(
  candidate: TradeCandidate,
  companyName: string,
  fastAnalysis: FastTriageResult,
  routingDecision: AiRoutingDecision,
  promptVersion: string,
): string {
  return sha256({
    ...candidateEvidence(candidate, companyName),
    sector: candidate.sector,
    fastAnalysis,
    routingDecision,
    promptVersion,
  });
}

function candidateEvidence(
  candidate: TradeCandidate,
  companyName: string,
): Record<string, unknown> {
  return {
    symbol: candidate.symbol,
    companyName,
    strategy: candidate.strategy,
    strategyVersion: candidate.strategyVersion,
    strategyScore: candidate.strategyScore,
    rankingScore: candidate.rankingScore,
    strategyRank: candidate.strategyRank,
    globalRank: candidate.globalRank,
    technicalSnapshot: candidate.technicalSnapshot,
    marketRegimeSnapshot: candidate.marketRegimeSnapshot,
    strategySnapshot: candidate.strategySnapshot,
    rankingSnapshot: candidate.rankingSnapshot,
    riskSnapshot: candidate.riskSnapshot,
    newsSnapshot: candidate.newsSnapshot,
  };
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
