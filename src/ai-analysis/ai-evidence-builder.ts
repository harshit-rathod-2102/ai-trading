import { JsonObject } from '../common/types/json-value';
import { AiRoutingDecision } from './models/ai-routing-decision.model';
import { DeepReviewInput } from './models/deep-review-result.model';
import { FastTriageInput, FastTriageResult } from './models/fast-triage-result.model';

export interface PersistedCandidateEvidence {
  readonly symbol: string;
  readonly sector: string | null;
  readonly strategy: string;
  readonly strategyVersion: string;
  readonly strategyScore: string | null;
  readonly rankingScore: string | null;
  readonly strategyRank: number | null;
  readonly globalRank: number | null;
  readonly technicalSnapshot: Record<string, unknown>;
  readonly marketRegimeSnapshot: Record<string, unknown> | null;
  readonly strategySnapshot: Record<string, unknown> | null;
  readonly rankingSnapshot: Record<string, unknown> | null;
  readonly riskSnapshot: Record<string, unknown>;
  readonly newsSnapshot: Record<string, unknown> | null;
}

export class AiEvidenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = AiEvidenceValidationError.name;
  }
}

export function buildFastTriageInput(
  evidence: PersistedCandidateEvidence,
  companyName: string,
): FastTriageInput {
  validateEvidence(evidence, companyName);
  return {
    symbol: evidence.symbol,
    companyName,
    strategy: evidence.strategy,
    strategyVersion: evidence.strategyVersion,
    strategyScore: evidence.strategyScore as string,
    rankingScore: evidence.rankingScore as string,
    strategyRank: evidence.strategyRank as number,
    globalRank: evidence.globalRank as number,
    marketRegime: jsonObject(evidence.marketRegimeSnapshot),
    technicalSnapshot: jsonObject(evidence.technicalSnapshot),
    riskSnapshot: jsonObject(evidence.riskSnapshot),
    newsSnapshot: jsonObject(evidence.newsSnapshot),
  };
}

export function buildDeepReviewInput(
  evidence: PersistedCandidateEvidence,
  companyName: string,
  fastAnalysis: FastTriageResult,
  routingDecision: AiRoutingDecision,
): DeepReviewInput {
  validateEvidence(evidence, companyName);
  return {
    symbol: evidence.symbol,
    companyName,
    sector: evidence.sector,
    strategy: evidence.strategy,
    strategyVersion: evidence.strategyVersion,
    strategyScore: evidence.strategyScore as string,
    rankingScore: evidence.rankingScore as string,
    strategyRank: evidence.strategyRank as number,
    globalRank: evidence.globalRank as number,
    technicalSnapshot: jsonObject(evidence.technicalSnapshot),
    marketRegimeSnapshot: jsonObject(evidence.marketRegimeSnapshot),
    strategySnapshot: jsonObject(evidence.strategySnapshot),
    rankingSnapshot: jsonObject(evidence.rankingSnapshot),
    riskSnapshot: jsonObject(evidence.riskSnapshot),
    newsSnapshot: jsonObject(evidence.newsSnapshot),
    fastAnalysis,
    routingDecision,
  };
}

export function validNewsSnapshot(value: unknown): value is Record<string, unknown> {
  if (
    !isRecord(value) ||
    typeof value.version !== 'string' ||
    !value.version.trim() ||
    typeof value.provider !== 'string' ||
    !value.provider.trim() ||
    typeof value.fetchedAt !== 'string' ||
    Number.isNaN(Date.parse(value.fetchedAt)) ||
    !Array.isArray(value.queries) ||
    !Array.isArray(value.articles) ||
    !Array.isArray(value.warnings) ||
    !Number.isInteger(value.articleCount) ||
    value.articleCount !== value.articles.length ||
    !isRecord(value.providerMetadata)
  )
    return false;
  return value.articles.every(
    (article) =>
      isRecord(article) && typeof article.title === 'string' && typeof article.url === 'string',
  );
}

function validateEvidence(evidence: PersistedCandidateEvidence, companyName: string): void {
  if (
    !evidence.symbol?.trim() ||
    !companyName?.trim() ||
    !evidence.strategy?.trim() ||
    !evidence.strategyVersion?.trim()
  ) {
    throw new AiEvidenceValidationError('Candidate identity and strategy evidence are required');
  }
  if (
    !isScore(evidence.strategyScore) ||
    !isScore(evidence.rankingScore) ||
    !isPositiveRank(evidence.strategyRank) ||
    !isPositiveRank(evidence.globalRank)
  ) {
    throw new AiEvidenceValidationError('Candidate score and rank evidence is invalid');
  }
  if (
    !isNonEmptyRecord(evidence.technicalSnapshot) ||
    !isNonEmptyRecord(evidence.riskSnapshot) ||
    !isNonEmptyRecord(evidence.marketRegimeSnapshot) ||
    !isNonEmptyRecord(evidence.strategySnapshot) ||
    !isNonEmptyRecord(evidence.rankingSnapshot)
  ) {
    throw new AiEvidenceValidationError('Candidate deterministic evidence is incomplete');
  }
  if (!validNewsSnapshot(evidence.newsSnapshot)) {
    throw new AiEvidenceValidationError('A completed news snapshot is required');
  }
}

function jsonObject(value: unknown): JsonObject {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (!isRecord(parsed)) throw new AiEvidenceValidationError('AI evidence must be a JSON object');
  return parsed as JsonObject;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length > 0;
}

function isPositiveRank(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isScore(value: unknown): boolean {
  const score = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN;
  return Number.isFinite(score) && score >= 0 && score <= 100;
}
