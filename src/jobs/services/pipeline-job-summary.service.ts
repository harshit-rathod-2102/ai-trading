import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { elapsedMilliseconds, structuredError } from '../../logging/logging.utils';
import { MessagingService } from '../../messaging/messaging.service';
import { AI_PROVIDER } from '../../providers/ai/ai-provider.token';
import { AiProvider } from '../../providers/ai/ai-provider.interface';
import {
  PipelineJobSummaryInput,
  PipelineJobSummaryResult,
} from '../../providers/ai/models/pipeline-job-summary';
import { MessageDeliveryStatus, MessageType } from '../../providers/messaging/models/message.enums';
import { ScanRun } from '../../scanner/entities/scan-run.entity';
import { DailyPipelineRun } from '../entities/daily-pipeline-run.entity';
import {
  PipelineJobSummaryRecord,
  PipelineJobSummaryStatus,
} from '../entities/pipeline-job-summary.entity';
import { DailyPipelineStatus } from '../models/job-data.model';
import {
  PIPELINE_JOB_SUMMARY_VERSION,
  PipelineJobSummaryDispatch,
  PipelineJobSummaryDeliveryResult,
  PipelineJobSummarySnapshot,
} from '../models/pipeline-job-summary.model';

interface PreparedSummary {
  readonly snapshot: PipelineJobSummarySnapshot;
  readonly message: string;
  readonly ai: PipelineJobSummaryResult | null;
}

@Injectable()
export class PipelineJobSummaryService {
  private readonly logger = new Logger(PipelineJobSummaryService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly messaging: MessagingService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider | null,
    @InjectRepository(DailyPipelineRun) private readonly runs: Repository<DailyPipelineRun>,
    @InjectRepository(ScanRun) private readonly scans: Repository<ScanRun>,
    @InjectRepository(PipelineJobSummaryRecord)
    private readonly summaries: Repository<PipelineJobSummaryRecord>,
  ) {}

  async sendForRun(
    pipelineRunId: string,
    dispatch: PipelineJobSummaryDispatch,
  ): Promise<PipelineJobSummaryDeliveryResult> {
    const startedAt = performance.now();
    const existing = await this.summaries.findOneBy({ pipelineRunId, jobId: dispatch.jobId });
    if (existing?.status === PipelineJobSummaryStatus.SENT) return this.result(existing, true);

    const prepared =
      !existing ||
      (existing.status === PipelineJobSummaryStatus.FAILED && !existing.summarySnapshot.aiGenerated)
        ? await this.prepare(pipelineRunId, dispatch)
        : null;
    const claim = await this.claim(pipelineRunId, dispatch, prepared);
    if (claim.reused) return this.result(claim.record, true);

    const record = claim.record;
    try {
      const recipient = this.config.get<string>('metaWhatsapp.allowedSender')?.trim();
      if (!recipient) {
        throw new ServiceUnavailableException('META_WHATSAPP_ALLOWED_SENDER is required');
      }
      const delivery = await this.messaging.sendMessage({
        recipient,
        messageType: MessageType.TEXT,
        text: record.messageText,
        metadata: {
          pipelineJobSummaryId: record.id,
          pipelineRunId,
          jobId: dispatch.jobId,
          version: PIPELINE_JOB_SUMMARY_VERSION,
        },
      });
      if (delivery.status === MessageDeliveryStatus.FAILED) {
        throw new ServiceUnavailableException('Messaging provider reported failed delivery');
      }
      record.status = PipelineJobSummaryStatus.SENT;
      record.messagingProvider =
        this.config.get<string>('providers.messaging') || 'messaging-provider';
      record.providerMessageId = delivery.providerMessageId;
      record.sentAt = delivery.sentAt ? new Date(delivery.sentAt) : new Date();
      record.errorMessage = null;
      const saved = await this.summaries.save(record);
      this.logger.log(
        {
          event: 'pipeline_job_summary.sent',
          pipelineRunId,
          jobId: dispatch.jobId,
          summaryId: saved.id,
          providerMessageId: saved.providerMessageId,
          aiGenerated: saved.summarySnapshot.aiGenerated,
          durationMs: elapsedMilliseconds(startedAt),
        },
        'Pipeline job summary sent',
      );
      return this.result(saved, false);
    } catch (error: unknown) {
      record.status = PipelineJobSummaryStatus.FAILED;
      record.errorMessage = (error instanceof Error ? error.message : 'Delivery failed').slice(
        0,
        4000,
      );
      await this.summaries.save(record);
      this.logger.error(
        {
          event: 'pipeline_job_summary.send.failed',
          pipelineRunId,
          jobId: dispatch.jobId,
          summaryId: record.id,
          durationMs: elapsedMilliseconds(startedAt),
          ...structuredError(error),
        },
        'Pipeline job summary send failed',
      );
      throw error;
    }
  }

  private async prepare(
    pipelineRunId: string,
    dispatch: PipelineJobSummaryDispatch,
  ): Promise<PreparedSummary> {
    const run = await this.runs.findOneByOrFail({ id: pipelineRunId });
    if (![DailyPipelineStatus.SUCCESS, DailyPipelineStatus.PARTIAL].includes(run.status)) {
      throw new Error(`Pipeline run ${pipelineRunId} is not complete`);
    }
    if (!run.scannerRunId) throw new Error(`Pipeline run ${pipelineRunId} has no scanner run`);
    const scan = await this.scans.findOneByOrFail({ id: run.scannerRunId });
    const regime = scan.marketRegimeSnapshot;
    if (!regime) throw new Error(`Scanner run ${scan.id} has no market regime snapshot`);
    const metadata = run.metadata as Record<string, unknown>;
    const marketData = record(metadata.marketData);
    const indexSymbols = stringList(marketData?.requiredBenchmarks);
    const input: PipelineJobSummaryInput = {
      marketDate: run.marketDate,
      triggerSource: dispatch.triggerSource,
      status: run.status,
      regime: String(regime.regime),
      regimeScore: regime.score,
      indexSymbols,
      universeEquities: scan.totalUniverse,
      eligibleEquities: scan.eligibleUniverse,
      evaluatedEquities: scan.evaluatedSymbols,
      qualifiedSetups: scan.qualifiedSetups,
      shortlistedCandidates: scan.shortlistedSetups,
    };
    let ai: PipelineJobSummaryResult | null = null;
    let aiWarning: string | null = null;
    try {
      if (!this.ai) throw new Error('No AI provider is configured');
      ai = await this.ai.summarizePipelineJob(input);
    } catch (error: unknown) {
      aiWarning = (error instanceof Error ? error.message : 'AI summary generation failed').slice(
        0,
        1000,
      );
      this.logger.warn(
        {
          event: 'pipeline_job_summary.ai.failed',
          pipelineRunId,
          marketDate: run.marketDate,
          ...structuredError(error),
        },
        'Pipeline job AI summary unavailable; using factual fallback',
      );
    }
    const aiSummary = ai?.summary ?? factualFallback(input);
    const snapshot: PipelineJobSummarySnapshot = {
      version: PIPELINE_JOB_SUMMARY_VERSION,
      pipelineRunId,
      jobTime: dispatch.requestedAt,
      completedAt: (run.completedAt ?? new Date()).toISOString(),
      ...input,
      aiSummary,
      aiGenerated: Boolean(ai),
      aiWarning,
    };
    return { snapshot, message: buildMessage(snapshot), ai };
  }

  private async claim(
    pipelineRunId: string,
    dispatch: PipelineJobSummaryDispatch,
    prepared: PreparedSummary | null,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('LOCK TABLE pipeline_job_summaries IN SHARE ROW EXCLUSIVE MODE');
      const repository = manager.getRepository(PipelineJobSummaryRecord);
      const existing = await repository.findOneBy({ pipelineRunId, jobId: dispatch.jobId });
      if (existing?.status === PipelineJobSummaryStatus.SENT) {
        return { record: existing, reused: true };
      }
      if (existing?.status === PipelineJobSummaryStatus.SENDING && !stale(existing.updatedAt)) {
        return { record: existing, reused: true };
      }
      if (existing) {
        if (prepared) {
          existing.summarySnapshot = prepared.snapshot;
          existing.messageText = prepared.message;
          existing.aiProvider = prepared.ai?.provider ?? null;
          existing.aiModel = prepared.ai?.resolvedModel ?? null;
          existing.aiPromptVersion = prepared.ai?.promptVersion ?? null;
          existing.aiRequestId = prepared.ai?.requestId ?? null;
          existing.generatedAt = new Date();
        }
        existing.status = PipelineJobSummaryStatus.SENDING;
        existing.deliveryAttempts += 1;
        existing.errorMessage = null;
        return { record: await repository.save(existing), reused: false };
      }
      if (!prepared) throw new Error('Pipeline job summary preparation is missing');
      const record = repository.create({
        id: randomUUID(),
        pipelineRunId,
        jobId: dispatch.jobId,
        status: PipelineJobSummaryStatus.SENDING,
        summarySnapshot: prepared.snapshot,
        messageText: prepared.message,
        aiProvider: prepared.ai?.provider ?? null,
        aiModel: prepared.ai?.resolvedModel ?? null,
        aiPromptVersion: prepared.ai?.promptVersion ?? null,
        aiRequestId: prepared.ai?.requestId ?? null,
        messagingProvider: null,
        providerMessageId: null,
        deliveryAttempts: 1,
        generatedAt: new Date(),
        sentAt: null,
        errorMessage: null,
      });
      return { record: await repository.save(record), reused: false };
    });
  }

  private result(
    record: PipelineJobSummaryRecord,
    reused: boolean,
  ): PipelineJobSummaryDeliveryResult {
    return {
      summaryId: record.id,
      pipelineRunId: record.pipelineRunId,
      jobId: record.jobId,
      status: record.status,
      providerMessageId: record.providerMessageId,
      reused,
    };
  }
}

function buildMessage(summary: PipelineJobSummarySnapshot): string {
  const jobTime = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(summary.jobTime));
  return [
    'Daily Scan Job Summary',
    '',
    `Job time: ${jobTime} IST`,
    `Trigger: ${summary.triggerSource}`,
    `Market session: ${summary.marketDate}`,
    `Status: ${summary.status}`,
    '',
    `Regime: ${summary.regime}`,
    `Regime score: ${summary.regimeScore}`,
    `Indices scanned: ${summary.indexSymbols.join(', ') || 'Unavailable'}`,
    '',
    `Universe equities: ${summary.universeEquities}`,
    `Eligible equities: ${summary.eligibleEquities}`,
    `Evaluated equities: ${summary.evaluatedEquities}`,
    `Qualified setups: ${summary.qualifiedSetups}`,
    `Shortlisted candidates: ${summary.shortlistedCandidates}`,
    '',
    `AI summary${summary.aiGenerated ? '' : ' (fallback)'}:`,
    summary.aiSummary,
  ].join('\n');
}

function factualFallback(input: PipelineJobSummaryInput): string {
  return `${input.regime} regime with score ${input.regimeScore}. ${input.evaluatedEquities} equities were evaluated, producing ${input.qualifiedSetups} qualified setups and ${input.shortlistedCandidates} shortlisted candidates.`;
}

function stale(updatedAt: Date): boolean {
  return Date.now() - updatedAt.getTime() > 5 * 60_000;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
}
