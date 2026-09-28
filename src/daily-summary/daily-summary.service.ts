import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { Between, DataSource, In, Repository } from 'typeorm';
import { CandidateStatus } from '../common/enums/candidate-status.enum';
import { TradeEventType } from '../common/enums/trade-event-type.enum';
import { TradeStatus } from '../common/enums/trade-status.enum';
import { marketClock, marketDateUtcBounds } from '../common/utils/market-time';
import { TradeCandidate } from '../candidates/entities/trade-candidate.entity';
import { DailyPipelineRun } from '../jobs/entities/daily-pipeline-run.entity';
import { DailyPipelineStatus } from '../jobs/models/job-data.model';
import { TradeEvent } from '../journal/entities/trade-event.entity';
import { elapsedMilliseconds, structuredError } from '../logging/logging.utils';
import { MarketRegimeSnapshot } from '../market-regime/entities/market-regime-snapshot.entity';
import { MessagingService } from '../messaging/messaging.service';
import { MessageDeliveryStatus, MessageType } from '../providers/messaging/models/message.enums';
import { calculatePortfolioConstraints } from '../risk/calculations/portfolio-constraints';
import { PortfolioRiskReaderService } from '../risk/portfolio-risk-reader.service';
import { ScanRun } from '../scanner/entities/scan-run.entity';
import { ScanStatus } from '../scanner/models/scan-status.enum';
import { Trade } from '../trades/entities/trade.entity';
import { TradingProfileService } from '../trading-profile/trading-profile.service';
import { DailySummaryMessageBuilder } from './daily-summary-message.builder';
import { DailySummaryRecord, DailySummaryStatus } from './entities/daily-summary.entity';
import {
  DAILY_SUMMARY_VERSION,
  DailyCandidateSummaryItem,
  DailySummary,
  DailySummarySnapshot,
  DailyTradeSummaryItem,
  TradePriceStatus,
} from './models/daily-summary.model';
import {
  DailySummaryErrorCode,
  DailySummaryPreview,
  DailySummaryResult,
} from './models/daily-summary-result.model';
import { isSessionDate } from '../market-data/market-data.validation';

interface SummaryClaim {
  readonly record: DailySummaryRecord;
  readonly reused: boolean;
}

@Injectable()
export class DailySummaryService {
  private readonly logger = new Logger(DailySummaryService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly messaging: MessagingService,
    private readonly profileService: TradingProfileService,
    private readonly portfolioRiskReader: PortfolioRiskReaderService,
    private readonly messageBuilder: DailySummaryMessageBuilder,
    @InjectRepository(DailySummaryRecord)
    private readonly summaries: Repository<DailySummaryRecord>,
    @InjectRepository(DailyPipelineRun) private readonly pipelineRuns: Repository<DailyPipelineRun>,
    @InjectRepository(MarketRegimeSnapshot)
    private readonly regimes: Repository<MarketRegimeSnapshot>,
    @InjectRepository(ScanRun) private readonly scanRuns: Repository<ScanRun>,
    @InjectRepository(TradeCandidate) private readonly candidates: Repository<TradeCandidate>,
    @InjectRepository(Trade) private readonly trades: Repository<Trade>,
    @InjectRepository(TradeEvent) private readonly events: Repository<TradeEvent>,
  ) {}

  async preview(marketDate: string): Promise<DailySummaryPreview> {
    const summary = await this.buildSummary(marketDate);
    return { summary, message: this.messageBuilder.build(summary) };
  }

  async buildSummary(marketDate: string): Promise<DailySummary> {
    this.validateDate(marketDate);
    const startedAt = performance.now();
    const generatedAt = new Date();
    this.logger.log(
      { event: 'daily_summary.build.started', marketDate, version: DAILY_SUMMARY_VERSION },
      'Daily summary build started',
    );
    try {
      const [{ start, end }, pipeline, regime, candidateRows, openTrades] = await Promise.all([
        Promise.resolve(marketDateUtcBounds(marketDate)),
        this.pipelineRuns.findOne({ where: { marketDate }, order: { updatedAt: 'DESC' } }),
        this.regimes.findOne({ where: { marketDate }, order: { calculatedAt: 'DESC' } }),
        this.candidates.find({ where: { marketDate }, order: { globalRank: 'ASC', id: 'ASC' } }),
        this.trades.find({
          where: { status: In([TradeStatus.OPEN, TradeStatus.PARTIALLY_CLOSED]) },
          order: { createdAt: 'ASC', id: 'ASC' },
        }),
      ]);
      const rangeEnd = new Date(end.getTime() - 1);
      const [scan, realized, portfolio] = await Promise.all([
        pipeline?.scannerRunId
          ? this.scanRuns.findOne({ where: { id: pipeline.scannerRunId } })
          : this.scanRuns.findOne({ where: { marketDate }, order: { startedAt: 'DESC' } }),
        this.realizedPnl(start, rangeEnd),
        this.portfolio(openTrades),
      ]);

      const warnings: string[] = [];
      this.pipelineWarnings(pipeline, warnings);
      if (scan?.status === ScanStatus.FAILED)
        warnings.push('Scanner failed; candidate counts do not represent a zero-opportunity day.');
      if (!scan) warnings.push('No scanner run is available for the requested market date.');
      if (regime?.warnings?.length)
        warnings.push(...regime.warnings.map((value) => `Market regime: ${value}`));
      warnings.push(...realized.warnings, ...portfolio.warnings);

      const tradeItems = openTrades.map((trade) => this.tradeItem(trade, marketDate, generatedAt));
      const stalePriceCount = tradeItems.filter((item) => item.priceStatus === 'STALE').length;
      const unavailablePriceCount = tradeItems.filter(
        (item) => item.priceStatus === 'UNAVAILABLE',
      ).length;
      if (stalePriceCount)
        warnings.push(
          `${stalePriceCount} open trade price(s) are stale; P&L uses the last persisted monitor observation.`,
        );
      if (unavailablePriceCount)
        warnings.push(
          `${unavailablePriceCount} open trade(s) have no reliable monitored price; aggregate position value and P&L are omitted.`,
        );

      const candidateSummary = this.candidateSummary(candidateRows, pipeline);
      const regimeSource = scan?.marketRegimeSnapshot ?? regime;
      const allTradeValuesAvailable = tradeItems.every(
        (item) =>
          item.currentPrice !== null &&
          item.unrealizedPnl !== null &&
          item.priceObservedAt !== null,
      );
      const currentPositionValue = allTradeValuesAvailable
        ? sum(
            openTrades.map((trade) =>
              new Decimal(trade.currentPrice as string).times(trade.quantity),
            ),
          )
        : null;
      const unrealizedPnl = allTradeValuesAvailable
        ? sum(openTrades.map((trade) => new Decimal(trade.unrealizedPnl as string)))
        : null;
      const maxTrades = this.config.getOrThrow<number>('dailySummary.maxTrades');
      const summary: DailySummary = {
        version: DAILY_SUMMARY_VERSION,
        marketDate,
        pipeline: {
          status: pipeline?.status ?? 'UNAVAILABLE',
          runId: pipeline?.id ?? null,
          failedAnalysisCount:
            pipeline?.candidateAnalysisFailures ?? candidateSummary.failedAnalysisCount,
        },
        market: {
          regime: text(regimeSource?.regime),
          score: text(regimeSource?.score),
          confidence: text(regimeSource?.confidence),
        },
        scan: {
          status: !scan ? 'UNAVAILABLE' : scan.status === ScanStatus.SUCCESS ? 'SUCCESS' : 'FAILED',
          runId: scan?.id ?? null,
          totalUniverse: scan?.totalUniverse ?? null,
          evaluatedSymbols: scan?.evaluatedSymbols ?? null,
          qualifiedSetups: scan?.qualifiedSetups ?? null,
          shortlistedSetups: scan?.shortlistedSetups ?? null,
        },
        candidates: candidateSummary,
        portfolio: {
          openTrades: openTrades.length,
          currentPositionValue,
          unrealizedPnl,
          realizedPnlToday: realized.value,
          openRisk: portfolio.openRisk,
          maxPortfolioRisk: portfolio.maxPortfolioRisk,
          stalePriceCount,
          unavailablePriceCount,
        },
        trades: tradeItems.slice(0, maxTrades),
        warnings: unique(warnings),
        generatedAt,
      };
      this.logger.log(
        {
          event: 'daily_summary.build.completed',
          marketDate,
          qualifiedCount: summary.candidates.qualifiedCount,
          openTradeCount: summary.portfolio.openTrades,
          pipelineStatus: summary.pipeline.status,
          scanStatus: summary.scan.status,
          warningCount: summary.warnings.length,
          durationMs: elapsedMilliseconds(startedAt),
        },
        'Daily summary build completed',
      );
      return summary;
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'daily_summary.build.failed',
          marketDate,
          durationMs: elapsedMilliseconds(startedAt),
          ...structuredError(error),
        },
        'Daily summary build failed',
      );
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException({
        code: DailySummaryErrorCode.SUMMARY_BUILD_FAILED,
        message: error instanceof Error ? error.message : 'Daily summary build failed',
      });
    }
  }

  async sendSummary(marketDate: string): Promise<DailySummaryResult> {
    this.validateDate(marketDate);
    const startedAt = performance.now();
    this.logger.log(
      { event: 'daily_summary.send.started', marketDate, version: DAILY_SUMMARY_VERSION },
      'Daily summary send started',
    );
    const existing = await this.summaries.findOneBy({ marketDate, version: DAILY_SUMMARY_VERSION });
    if (existing?.status === DailySummaryStatus.SENT) {
      this.logger.log(
        {
          event: 'daily_summary.reused',
          marketDate,
          summaryId: existing.id,
          providerMessageId: existing.providerMessageId,
          status: existing.status,
        },
        'Existing daily summary delivery reused',
      );
      return this.result(existing, true);
    }

    const preview = existing ? null : await this.preview(marketDate);
    const claim = await this.claimDelivery(marketDate, preview);
    if (claim.reused) {
      this.logger.log(
        {
          event: 'daily_summary.reused',
          marketDate,
          summaryId: claim.record.id,
          providerMessageId: claim.record.providerMessageId,
          status: claim.record.status,
        },
        'Existing daily summary delivery reused',
      );
      return this.result(claim.record, true);
    }

    const record = claim.record;
    try {
      const recipient = this.config.get<string>('metaWhatsapp.allowedSender')?.trim();
      if (!recipient)
        throw new ServiceUnavailableException('META_WHATSAPP_ALLOWED_SENDER is required');
      const delivery = await this.messaging.sendMessage({
        recipient,
        messageType: MessageType.TEXT,
        text: record.messageText,
        metadata: { dailySummaryId: record.id, marketDate, version: DAILY_SUMMARY_VERSION },
      });
      if (delivery.status === MessageDeliveryStatus.FAILED) {
        throw new ServiceUnavailableException('Messaging provider reported failed delivery');
      }
      const sentAt = delivery.sentAt ? new Date(delivery.sentAt) : new Date();
      record.status = DailySummaryStatus.SENT;
      record.provider = this.config.get<string>('providers.messaging') || 'messaging-provider';
      record.providerMessageId = delivery.providerMessageId;
      record.sentAt = sentAt;
      record.errorMessage = null;
      const saved = await this.summaries.save(record);
      const summary = fromSnapshot(saved.summarySnapshot);
      this.logger.log(
        {
          event: 'daily_summary.sent',
          marketDate,
          summaryId: saved.id,
          qualifiedCount: summary.candidates.qualifiedCount,
          openTradeCount: summary.portfolio.openTrades,
          providerMessageId: saved.providerMessageId,
          durationMs: elapsedMilliseconds(startedAt),
          status: saved.status,
        },
        'Daily summary sent',
      );
      return this.result(saved, false);
    } catch (error: unknown) {
      record.status = DailySummaryStatus.FAILED;
      record.errorMessage = (
        error instanceof Error ? error.message : 'Messaging delivery failed'
      ).slice(0, 4000);
      await this.summaries.save(record);
      this.logger.error(
        {
          event: 'daily_summary.send.failed',
          marketDate,
          summaryId: record.id,
          qualifiedCount: record.summarySnapshot.candidates.qualifiedCount,
          openTradeCount: record.summarySnapshot.portfolio.openTrades,
          durationMs: elapsedMilliseconds(startedAt),
          ...structuredError(error),
        },
        'Daily summary send failed',
      );
      throw new ServiceUnavailableException({
        code: DailySummaryErrorCode.MESSAGING_DELIVERY_FAILED,
        message: record.errorMessage,
        summaryId: record.id,
      });
    }
  }

  private candidateSummary(rows: readonly TradeCandidate[], pipeline: DailyPipelineRun | null) {
    const qualified = rows.filter((candidate) => candidateOutcome(candidate) === 'QUALIFIED');
    const waitCount = rows.filter((candidate) => candidateOutcome(candidate) === 'WAIT').length;
    const rejectedCount = rows.filter(
      (candidate) => candidateOutcome(candidate) === 'REJECTED',
    ).length;
    const pending = rows.filter(
      (candidate) =>
        candidateOutcome(candidate) === null &&
        [CandidateStatus.NEW, CandidateStatus.ANALYZED].includes(candidate.status),
    ).length;
    const maxCandidates = this.config.getOrThrow<number>('dailySummary.maxCandidates');
    const ordered = [...qualified].sort(
      (left, right) =>
        (left.globalRank ?? Number.MAX_SAFE_INTEGER) -
          (right.globalRank ?? Number.MAX_SAFE_INTEGER) || left.symbol.localeCompare(right.symbol),
    );
    return {
      qualifiedCount: qualified.length,
      qualified: ordered.slice(0, maxCandidates).map((candidate) => this.candidateItem(candidate)),
      waitCount,
      rejectedCount,
      failedAnalysisCount: Math.max(pipeline?.candidateAnalysisFailures ?? 0, pending),
    };
  }

  private candidateItem(candidate: TradeCandidate): DailyCandidateSummaryItem {
    const analysis = record(candidate.aiAnalysis);
    const selected = record(analysis?.deep) ?? record(analysis?.fast);
    const risk = record(candidate.riskSnapshot);
    const outcome = candidateOutcome(candidate);
    const notificationStatus: DailyCandidateSummaryItem['notificationStatus'] =
      candidate.notificationSnapshot ||
      candidate.notifiedAt ||
      candidate.status === CandidateStatus.NOTIFIED
        ? 'SENT'
        : candidate.status === CandidateStatus.QUALIFIED
          ? 'PENDING'
          : outcome === 'QUALIFIED'
            ? 'NOT_SENT'
            : 'NOT_APPLICABLE';
    return {
      candidateId: candidate.id,
      symbol: candidate.symbol,
      strategy: candidate.strategy,
      globalRank: candidate.globalRank,
      rankingScore: candidate.rankingScore ?? candidate.strategyScore ?? candidate.quantScore,
      plannedEntry: candidate.proposedEntry,
      stop: candidate.proposedStop,
      quantity: candidate.suggestedQuantity,
      plannedRisk: numericText(risk?.plannedLossAtStop),
      aiSummary: text(selected?.summary),
      primaryRisk:
        firstString(selected?.redFlags) ??
        firstString(selected?.bearishFactors) ??
        firstString(selected?.invalidationConcerns),
      notificationStatus,
      currentStatus: candidate.status,
    };
  }

  private tradeItem(trade: Trade, marketDate: string, generatedAt: Date): DailyTradeSummaryItem {
    let priceStatus: TradePriceStatus = 'UNAVAILABLE';
    if (trade.currentPrice && trade.lastPriceObservedAt) {
      const staleMinutes = this.config.getOrThrow<number>('dailySummary.priceStaleMinutes');
      const ageMinutes = (generatedAt.getTime() - trade.lastPriceObservedAt.getTime()) / 60_000;
      priceStatus =
        marketClock(trade.lastPriceObservedAt).marketDate === marketDate &&
        ageMinutes >= 0 &&
        ageMinutes <= staleMinutes
          ? 'CURRENT'
          : 'STALE';
    }
    return {
      tradeId: trade.id,
      symbol: trade.symbol,
      quantity: trade.quantity,
      entry: trade.actualEntry,
      currentPrice: trade.currentPrice,
      currentStop: trade.currentStop,
      currentR: trade.currentR,
      unrealizedPnl: trade.currentPrice ? trade.unrealizedPnl : null,
      priceStatus,
      priceObservedAt: trade.lastPriceObservedAt?.toISOString() ?? null,
    };
  }

  private async portfolio(openTrades: readonly Trade[]) {
    try {
      const [profile, riskTrades] = await Promise.all([
        this.profileService.getActiveProfile(),
        this.portfolioRiskReader.loadOpenTrades(),
      ]);
      const calculation = calculatePortfolioConstraints(profile, riskTrades, null);
      return {
        openRisk: calculation.portfolioRiskBefore.toDecimalPlaces(4).toFixed(4),
        maxPortfolioRisk: calculation.maxPortfolioRisk.toDecimalPlaces(4).toFixed(4),
        warnings: [...calculation.warnings],
      };
    } catch (error: unknown) {
      return {
        openRisk: openTrades.length ? null : '0.0000',
        maxPortfolioRisk: null,
        warnings: [
          `Portfolio risk unavailable: ${error instanceof Error ? error.message : 'unknown failure'}`,
        ],
      };
    }
  }

  private async realizedPnl(start: Date, end: Date) {
    const events = await this.events.find({
      where: { eventType: TradeEventType.TRADE_CLOSED, createdAt: Between(start, end) },
      relations: { trade: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const warnings: string[] = [];
    if (events.length) {
      let total = new Decimal(0);
      for (const event of events) {
        const recorded = numericText(record(event.data)?.realizedPnl);
        if (event.price && event.quantity && event.trade?.actualEntry) {
          total = total.plus(
            new Decimal(event.price).minus(event.trade.actualEntry).times(event.quantity),
          );
        } else if (recorded !== null) {
          total = total.plus(recorded);
        } else {
          warnings.push(`Realized P&L could not be derived for exit event ${event.id}.`);
        }
      }
      return { value: total.toDecimalPlaces(4).toFixed(4), warnings };
    }
    const closed = await this.trades.find({
      where: {
        closedAt: Between(start, end),
        status: In([TradeStatus.CLOSED, TradeStatus.STOPPED_OUT]),
      },
    });
    return {
      value: sum(closed.map((trade) => new Decimal(trade.realizedPnl))) ?? '0.0000',
      warnings,
    };
  }

  private pipelineWarnings(pipeline: DailyPipelineRun | null, warnings: string[]): void {
    if (!pipeline) {
      warnings.push('Daily pipeline run is unavailable for this market date.');
      return;
    }
    if (pipeline.status === DailyPipelineStatus.PARTIAL) {
      warnings.push(
        `Pipeline is PARTIAL; ${pipeline.candidateAnalysisFailures} candidate analysis failure(s) remain.`,
      );
    } else if (pipeline.status === DailyPipelineStatus.FAILED) {
      warnings.push(`Pipeline FAILED${pipeline.errorMessage ? `: ${pipeline.errorMessage}` : '.'}`);
    } else if (pipeline.status === DailyPipelineStatus.STARTED) {
      warnings.push('Pipeline is still STARTED; candidate analysis may be incomplete.');
    }
    if (pipeline.marketDataStatus !== 'CURRENT')
      warnings.push(`Market data status is ${pipeline.marketDataStatus}.`);
    if (pipeline.newsFailures)
      warnings.push(`${pipeline.newsFailures} news enrichment failure(s).`);
    if (pipeline.aiFailures) warnings.push(`${pipeline.aiFailures} AI analysis failure(s).`);
    if (pipeline.notificationFailures)
      warnings.push(`${pipeline.notificationFailures} candidate notification failure(s).`);
  }

  private async claimDelivery(
    marketDate: string,
    preview: DailySummaryPreview | null,
  ): Promise<SummaryClaim> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('LOCK TABLE daily_summaries IN SHARE ROW EXCLUSIVE MODE');
      const repository = manager.getRepository(DailySummaryRecord);
      let recordValue = await repository.findOneBy({ marketDate, version: DAILY_SUMMARY_VERSION });
      if (recordValue?.status === DailySummaryStatus.SENT)
        return { record: recordValue, reused: true };
      if (recordValue?.status === DailySummaryStatus.SENDING) {
        const lease = this.config.getOrThrow<number>('dailySummary.sendLeaseMinutes') * 60_000;
        if (Date.now() - recordValue.updatedAt.getTime() < lease) {
          throw new ConflictException({
            code: DailySummaryErrorCode.SUMMARY_SEND_IN_PROGRESS,
            message: 'Daily summary delivery is already in progress',
            summaryId: recordValue.id,
          });
        }
      }
      if (!recordValue) {
        if (!preview) throw new Error('Daily summary preview is required for first delivery');
        recordValue = repository.create({
          id: randomUUID(),
          marketDate,
          version: DAILY_SUMMARY_VERSION,
          status: DailySummaryStatus.GENERATED,
          summarySnapshot: toSnapshot(preview.summary),
          messageText: preview.message,
          provider: null,
          providerMessageId: null,
          deliveryAttempts: 0,
          generatedAt: preview.summary.generatedAt,
          sentAt: null,
          errorMessage: null,
        });
      }
      recordValue.status = DailySummaryStatus.SENDING;
      recordValue.deliveryAttempts += 1;
      recordValue.errorMessage = null;
      return { record: await repository.save(recordValue), reused: false };
    });
  }

  private result(recordValue: DailySummaryRecord, reused: boolean): DailySummaryResult {
    return {
      summaryId: recordValue.id,
      status: recordValue.status,
      reusedExistingDelivery: reused,
      provider: recordValue.provider,
      providerMessageId: recordValue.providerMessageId,
      sentAt: recordValue.sentAt?.toISOString() ?? null,
      summary: fromSnapshot(recordValue.summarySnapshot),
      message: recordValue.messageText,
    };
  }

  private validateDate(marketDate: string): void {
    if (!isSessionDate(marketDate)) {
      throw new BadRequestException({
        code: DailySummaryErrorCode.SUMMARY_DATE_INVALID,
        message: 'marketDate must be a real date in YYYY-MM-DD format',
      });
    }
  }
}

function candidateOutcome(candidate: TradeCandidate): 'QUALIFIED' | 'WAIT' | 'REJECTED' | null {
  const outcome = text(record(candidate.decisionSnapshot)?.outcome);
  if (outcome === 'QUALIFIED' || outcome === 'WAIT' || outcome === 'REJECTED') return outcome;
  if (
    [CandidateStatus.QUALIFIED, CandidateStatus.NOTIFIED, CandidateStatus.ACCEPTED].includes(
      candidate.status,
    )
  ) {
    return 'QUALIFIED';
  }
  if (candidate.status === CandidateStatus.WAIT) return 'WAIT';
  if (candidate.status === CandidateStatus.REJECTED) return 'REJECTED';
  return null;
}

function toSnapshot(summary: DailySummary): DailySummarySnapshot {
  return { ...summary, generatedAt: summary.generatedAt.toISOString() };
}

function fromSnapshot(snapshot: DailySummarySnapshot): DailySummary {
  return { ...snapshot, generatedAt: new Date(snapshot.generatedAt) };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : null;
}

function numericText(value: unknown): string | null {
  const candidate = text(value);
  if (candidate === null) return null;
  try {
    return new Decimal(candidate).toDecimalPlaces(4).toFixed(4);
  } catch {
    return null;
  }
}

function firstString(value: unknown): string | null {
  return Array.isArray(value)
    ? (value.find((item) => typeof item === 'string' && item.trim())?.trim() ?? null)
    : null;
}

function sum(values: readonly Decimal[]): string | null {
  if (!values.length) return '0.0000';
  return values
    .reduce((total, value) => total.plus(value), new Decimal(0))
    .toDecimalPlaces(4)
    .toFixed(4);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
