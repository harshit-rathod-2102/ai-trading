import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CandidateStatus } from '../common/enums/candidate-status.enum';
import { EventSource } from '../common/enums/event-source.enum';
import { TradeEventType } from '../common/enums/trade-event-type.enum';
import { TradeCandidate } from '../candidates/entities/trade-candidate.entity';
import { Instrument } from '../instruments/entities/instrument.entity';
import { JournalService } from '../journal/journal.service';
import { elapsedMilliseconds, structuredError } from '../logging/logging.utils';
import { MessageDeliveryStatus, MessageType } from '../providers/messaging/models/message.enums';
import { MessagingService } from './messaging.service';
import {
  CANDIDATE_NOTIFICATION_VERSION,
  CandidateAnalysisIssue,
  CandidateAnalysisIssueNotificationResult,
  CandidateNotificationResult,
  CandidateNotificationSnapshot,
} from './models/candidate-notification.model';

@Injectable()
export class CandidateNotificationService {
  private readonly logger = new Logger(CandidateNotificationService.name);

  private readonly inFlight = new Map<string, Promise<CandidateNotificationResult>>();

  private readonly analysisIssueInFlight = new Map<
    string,
    Promise<CandidateAnalysisIssueNotificationResult>
  >();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TradeCandidate)
    private readonly candidates: Repository<TradeCandidate>,
    @InjectRepository(Instrument)
    private readonly instruments: Repository<Instrument>,
    private readonly messaging: MessagingService,
    private readonly journal: JournalService,
    private readonly config: ConfigService,
  ) {}

  notifyCandidate(candidateId: string): Promise<CandidateNotificationResult> {
    const existing = this.inFlight.get(candidateId);
    if (existing) return existing;
    const execution = this.execute(candidateId).finally(() => {
      if (this.inFlight.get(candidateId) === execution) this.inFlight.delete(candidateId);
    });
    this.inFlight.set(candidateId, execution);
    return execution;
  }

  /**
   * Delivers an analysis-availability notice without changing the candidate's decision state.
   * A failed qualitative provider must never make a candidate actionable, but it also must not
   * prevent the user from learning why no actionable alert was produced.
   */
  notifyAnalysisIssue(
    candidateId: string,
    issue: CandidateAnalysisIssue,
  ): Promise<CandidateAnalysisIssueNotificationResult> {
    const key = `${candidateId}:${issue.kind}:${issue.code}`;
    const existing = this.analysisIssueInFlight.get(key);
    if (existing) return existing;
    const execution = this.executeAnalysisIssue(candidateId, issue).finally(() => {
      if (this.analysisIssueInFlight.get(key) === execution) this.analysisIssueInFlight.delete(key);
    });
    this.analysisIssueInFlight.set(key, execution);
    return execution;
  }

  private async executeAnalysisIssue(
    candidateId: string,
    issue: CandidateAnalysisIssue,
  ): Promise<CandidateAnalysisIssueNotificationResult> {
    const sent = await this.journal.forCandidate(candidateId);
    const existing = sent.find((event) => issueNotificationMatches(event, issue));
    const existingDelivery = issueNotificationDelivery(existing?.data);
    if (existingDelivery?.providerMessageId) {
      return {
        candidateId,
        issue,
        providerMessageId: existingDelivery.providerMessageId,
        reusedExistingNotification: true,
      };
    }

    const candidate = await this.candidates.findOneBy({ id: candidateId });
    if (!candidate) throw new NotFoundException({ code: 'CANDIDATE_NOT_FOUND', candidateId });
    const recipient = this.config.get<string>('metaWhatsapp.allowedSender')?.trim();
    if (!recipient) {
      throw new ServiceUnavailableException({
        code: 'MESSAGING_DELIVERY_FAILED',
        message: 'META_WHATSAPP_ALLOWED_SENDER is required for candidate delivery',
      });
    }
    const instrument = await this.instruments.findOneBy({
      symbol: candidate.symbol,
      exchange: candidate.exchange,
    });
    const delivery = await this.messaging.sendMessage({
      recipient,
      messageType: MessageType.TEXT,
      text: buildCandidateAnalysisIssueMessage(candidate, instrument?.name ?? null, issue),
      metadata: { candidateId, analysisIssue: issue.kind, analysisIssueCode: issue.code },
    });
    if (delivery.status === MessageDeliveryStatus.FAILED) {
      throw new ServiceUnavailableException({
        code: 'MESSAGING_DELIVERY_FAILED',
        message: 'Messaging provider reported failed delivery',
      });
    }
    await this.dataSource.transaction(async (manager) => {
      await this.journal.record(manager, {
        candidateId,
        eventType: TradeEventType.CANDIDATE_ANALYSIS_FAILED,
        source: EventSource.SYSTEM,
        data: {
          issue,
          notification: {
            provider: this.config.get<string>('providers.messaging') || 'messaging-provider',
            providerMessageId: delivery.providerMessageId,
            deliveryStatus: delivery.status,
            providerSentAt: delivery.sentAt,
            recordedAt: new Date().toISOString(),
          },
        },
      });
    });
    this.logger.warn(
      {
        event: 'whatsapp.candidate.analysis_issue.sent',
        module: CandidateNotificationService.name,
        operation: 'notifyAnalysisIssue',
        candidateId,
        symbol: candidate.symbol,
        issueKind: issue.kind,
        issueCode: issue.code,
        providerMessageId: delivery.providerMessageId,
      },
      'WhatsApp candidate analysis-issue delivery completed',
    );
    return {
      candidateId,
      issue,
      providerMessageId: delivery.providerMessageId,
      reusedExistingNotification: false,
    };
  }

  private async execute(candidateId: string): Promise<CandidateNotificationResult> {
    const startedAt = performance.now();
    let candidate: TradeCandidate | undefined;
    this.logger.log(
      {
        event: 'whatsapp.candidate.send.started',
        module: CandidateNotificationService.name,
        operation: 'notifyCandidate',
        candidateId,
      },
      'WhatsApp candidate delivery started',
    );
    try {
      candidate = (await this.candidates.findOneBy({ id: candidateId })) ?? undefined;
      if (!candidate) throw new NotFoundException({ code: 'CANDIDATE_NOT_FOUND', candidateId });
      const reused = existingNotification(candidate);
      if (candidate.status === CandidateStatus.NOTIFIED && reused) {
        this.logger.log(
          {
            event: 'whatsapp.candidate.send.completed',
            ...this.logFields(candidate, startedAt),
            providerMessageId: reused.providerMessageId,
            reused: true,
          },
          'Existing WhatsApp candidate delivery reused',
        );
        return reused;
      }
      if (candidate.status !== CandidateStatus.QUALIFIED) {
        throw new ConflictException({
          code: 'CANDIDATE_NOT_ACTIONABLE',
          message: `Only QUALIFIED candidates can be notified; current status is ${candidate.status}`,
          candidateId,
        });
      }
      if (
        candidate.notificationSnapshot ||
        candidate.notifiedAt ||
        candidate.notificationProviderMessageId
      ) {
        throw new ConflictException({
          code: 'INVALID_NOTIFICATION_STATE',
          message: 'Candidate has incomplete or inconsistent notification metadata',
          candidateId,
        });
      }
      const recipient = this.config.get<string>('metaWhatsapp.allowedSender')?.trim();
      if (!recipient) {
        throw new ServiceUnavailableException({
          code: 'MESSAGING_DELIVERY_FAILED',
          message: 'META_WHATSAPP_ALLOWED_SENDER is required for candidate delivery',
        });
      }
      const instrument = await this.instruments.findOneBy({
        symbol: candidate.symbol,
        exchange: candidate.exchange,
      });
      const message = buildCandidateMessage(candidate, instrument?.name ?? null);
      const delivery = await this.messaging.sendMessage({
        recipient,
        messageType: MessageType.TEXT,
        text: message,
        metadata: { candidateId },
      });
      if (delivery.status === MessageDeliveryStatus.FAILED) {
        throw new ServiceUnavailableException({
          code: 'MESSAGING_DELIVERY_FAILED',
          message: 'Messaging provider reported failed delivery',
        });
      }
      const recordedAt = new Date();
      const provider = this.config.get<string>('providers.messaging') || 'messaging-provider';
      const snapshot: CandidateNotificationSnapshot = {
        version: CANDIDATE_NOTIFICATION_VERSION,
        provider,
        providerMessageId: delivery.providerMessageId,
        deliveryStatus: delivery.status,
        providerSentAt: delivery.sentAt,
        messageType: MessageType.TEXT,
        recordedAt: recordedAt.toISOString(),
      };
      const result = await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(TradeCandidate);
        const locked = await repository.findOne({
          where: { id: candidateId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) throw new NotFoundException({ code: 'CANDIDATE_NOT_FOUND', candidateId });
        const alreadyStored = existingNotification(locked);
        if (locked.status === CandidateStatus.NOTIFIED && alreadyStored) return alreadyStored;
        if (
          locked.status !== CandidateStatus.QUALIFIED ||
          locked.notificationSnapshot ||
          locked.notifiedAt ||
          locked.notificationProviderMessageId
        ) {
          throw new ConflictException({
            code: 'CANDIDATE_NOT_ACTIONABLE',
            message: 'Candidate state changed during WhatsApp delivery',
            candidateId,
          });
        }
        locked.status = CandidateStatus.NOTIFIED;
        locked.notificationSnapshot = jsonRecord(snapshot);
        locked.notifiedAt = recordedAt;
        locked.notificationProviderMessageId = delivery.providerMessageId;
        await repository.save(locked);
        await this.journal.record(manager, {
          candidateId,
          eventType: TradeEventType.CANDIDATE_NOTIFIED,
          source: EventSource.SYSTEM,
          data: {
            notificationVersion: snapshot.version,
            provider: snapshot.provider,
            providerMessageId: snapshot.providerMessageId,
            deliveryStatus: snapshot.deliveryStatus,
            messageType: snapshot.messageType,
            previousStatus: CandidateStatus.QUALIFIED,
            status: CandidateStatus.NOTIFIED,
          },
        });
        return notificationResult(candidateId, snapshot, false);
      });
      this.logger.log(
        {
          event: 'whatsapp.candidate.send.completed',
          ...this.logFields(candidate, startedAt),
          providerMessageId: result.providerMessageId,
          deliveryStatus: result.deliveryStatus,
          reused: result.reusedExistingNotification,
        },
        'WhatsApp candidate delivery completed',
      );
      this.logger.log(
        {
          event: 'candidate.notified',
          ...this.logFields(candidate, startedAt),
          providerMessageId: result.providerMessageId,
          newStatus: CandidateStatus.NOTIFIED,
        },
        'Candidate marked as notified',
      );
      return result;
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'whatsapp.candidate.send.failed',
          module: CandidateNotificationService.name,
          operation: 'notifyCandidate',
          candidateId,
          ...(candidate
            ? {
                symbol: candidate.symbol,
                strategy: candidate.strategy,
                candidateStatus: candidate.status,
              }
            : {}),
          durationMs: elapsedMilliseconds(startedAt),
          ...structuredError(error),
        },
        'WhatsApp candidate delivery failed',
      );
      throw error;
    }
  }

  private logFields(candidate: TradeCandidate, startedAt: number): Record<string, unknown> {
    return {
      module: CandidateNotificationService.name,
      operation: 'notifyCandidate',
      candidateId: candidate.id,
      symbol: candidate.symbol,
      strategy: candidate.strategy,
      durationMs: elapsedMilliseconds(startedAt),
    };
  }
}

export function buildCandidateMessage(
  candidate: TradeCandidate,
  companyName: string | null,
): string {
  const risk = candidate.riskSnapshot;
  const regime = textValue(candidate.marketRegimeSnapshot?.regime) ?? 'UNKNOWN';
  const analysis = isRecord(candidate.aiAnalysis)
    ? isRecord(candidate.aiAnalysis.deep)
      ? candidate.aiAnalysis.deep
      : isRecord(candidate.aiAnalysis.fast)
        ? candidate.aiAnalysis.fast
        : {}
    : {};
  const summary = truncate(
    textValue(analysis.summary) ?? 'AI review completed from persisted evidence.',
    420,
  );
  const bullish = stringValues(analysis.bullishFactors).slice(0, 2);
  const risks = [
    ...stringValues(analysis.bearishFactors),
    ...stringValues(analysis.redFlags),
    ...stringValues(risk.warnings),
  ]
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 3);
  const sourceTier = isRecord(candidate.decisionSnapshot)
    ? textValue(candidate.decisionSnapshot.sourceTier)
    : undefined;
  const lines = [
    `📈 ${candidate.symbol}${companyName ? ` — ${companyName}` : ''}`,
    candidate.strategy.replaceAll('_', ' '),
    '',
    `Rank: #${candidate.globalRank ?? candidate.strategyRank ?? '?'}`,
    `Setup score: ${candidate.rankingScore ?? candidate.strategyScore ?? candidate.quantScore}`,
    `Market: ${regime}`,
    '',
    `Entry: ₹${candidate.proposedEntry}`,
    `Stop: ₹${candidate.proposedStop}`,
    `Qty: ${candidate.suggestedQuantity}`,
    `Capital: ${moneyValue(risk.capitalRequired)}`,
    `Risk at stop: ${moneyValue(risk.plannedLossAtStop)}`,
    `T1: ${candidate.target1 ? `₹${candidate.target1}` : 'N/A'}`,
    `T2: ${candidate.target2 ? `₹${candidate.target2}` : 'N/A'}`,
    `R:R: ${textValue(risk.rewardRiskToTarget1) ?? 'N/A'} / ${textValue(risk.rewardRiskToTarget2) ?? 'N/A'}`,
    '',
    `AI review${sourceTier ? ` (${sourceTier})` : ''}:`,
    summary,
    ...(bullish.length
      ? ['', 'Strengths:', ...bullish.map((value) => `• ${truncate(value, 180)}`)]
      : []),
    ...(risks.length ? ['', 'Risks:', ...risks.map((value) => `• ${truncate(value, 180)}`)] : []),
    '',
    `Candidate: ${candidate.id.slice(0, 8).toUpperCase()}`,
    '',
    'Reply:',
    `BUY ${candidate.proposedEntry} ${candidate.suggestedQuantity}`,
    `BUY ${candidate.symbol} ${candidate.proposedEntry} ${candidate.suggestedQuantity}`,
    'SKIP',
    `SKIP ${candidate.symbol}`,
    '',
    'BUY records a manually executed trade. No broker order is placed.',
  ];
  return lines.join('\n').slice(0, 4096);
}

export function buildCandidateAnalysisIssueMessage(
  candidate: TradeCandidate,
  companyName: string | null,
  issue: CandidateAnalysisIssue,
): string {
  const fast =
    isRecord(candidate.aiAnalysis) && isRecord(candidate.aiAnalysis.fast)
      ? candidate.aiAnalysis.fast
      : null;
  const fastSummary = textValue(fast?.summary);
  const kind = {
    NEWS: 'News lookup',
    FAST_AI: 'FAST AI review',
    DEEP_AI: 'DEEP AI review',
    DECISION: 'Candidate decision',
  }[issue.kind];
  return [
    `⚠️ Candidate analysis incomplete: ${candidate.symbol}${companyName ? ` — ${companyName}` : ''}`,
    candidate.strategy.replaceAll('_', ' '),
    '',
    `${kind}: FAILED`,
    `Reason: ${humanizeIssue(issue.code)}`,
    ...(issue.kind === 'DEEP_AI' && fastSummary
      ? ['', 'FAST AI summary:', truncate(fastSummary, 500)]
      : []),
    '',
    'Qualitative checks are advisory in V1. Deterministic strategy and risk review continues.',
    'A separate candidate alert will be sent if the deterministic setup qualifies.',
    'No broker order was placed.',
    `Candidate: ${candidate.id.slice(0, 8).toUpperCase()}`,
  ]
    .join('\n')
    .slice(0, 4096);
}

function issueNotificationMatches(
  event: { eventType: TradeEventType; data: Record<string, unknown> | null },
  issue: CandidateAnalysisIssue,
): boolean {
  if (event.eventType !== TradeEventType.CANDIDATE_ANALYSIS_FAILED || !isRecord(event.data)) {
    return false;
  }
  const stored = event.data.issue;
  return isRecord(stored) && stored.kind === issue.kind && stored.code === issue.code;
}

function issueNotificationDelivery(
  value: Record<string, unknown> | null | undefined,
): { providerMessageId: string } | null {
  if (!isRecord(value) || !isRecord(value.notification)) return null;
  const providerMessageId = textValue(value.notification.providerMessageId);
  const status = textValue(value.notification.deliveryStatus);
  return status && status !== MessageDeliveryStatus.FAILED && providerMessageId
    ? { providerMessageId }
    : null;
}

function humanizeIssue(code: string): string {
  return code
    .replace(/^AI_/, 'AI ')
    .replace(/^NEWS_/, 'news ')
    .replaceAll('_', ' ')
    .toLowerCase();
}

function existingNotification(candidate: TradeCandidate): CandidateNotificationResult | null {
  const value = candidate.notificationSnapshot;
  if (
    !isRecord(value) ||
    value.version !== CANDIDATE_NOTIFICATION_VERSION ||
    typeof value.provider !== 'string' ||
    typeof value.providerMessageId !== 'string' ||
    !Object.values(MessageDeliveryStatus).includes(value.deliveryStatus as MessageDeliveryStatus) ||
    value.messageType !== MessageType.TEXT ||
    typeof value.recordedAt !== 'string' ||
    Number.isNaN(Date.parse(value.recordedAt)) ||
    (value.providerSentAt !== null && typeof value.providerSentAt !== 'string') ||
    candidate.notificationProviderMessageId !== value.providerMessageId ||
    !candidate.notifiedAt ||
    candidate.notifiedAt.toISOString() !== value.recordedAt
  )
    return null;
  return notificationResult(candidate.id, value as unknown as CandidateNotificationSnapshot, true);
}

function notificationResult(
  candidateId: string,
  snapshot: CandidateNotificationSnapshot,
  reusedExistingNotification: boolean,
): CandidateNotificationResult {
  return {
    candidateId,
    notified: true,
    reusedExistingNotification,
    previousStatus: CandidateStatus.QUALIFIED,
    newStatus: CandidateStatus.NOTIFIED,
    ...snapshot,
  };
}

function moneyValue(value: unknown): string {
  const text = textValue(value);
  return text ? `₹${text}` : 'N/A';
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : undefined;
}

function stringValues(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonRecord(value: unknown): Record<string, unknown> {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (!isRecord(parsed)) throw new Error('Notification snapshot must be a JSON object');
  return parsed;
}
