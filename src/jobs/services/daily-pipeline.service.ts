import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { stableStringify } from '../../ai-analysis/ai-evidence-hash';
import { CandidateOrchestrationService } from '../../candidates/candidate-orchestration.service';
import { CandidateOrchestrationOutcome } from '../../candidates/models/candidate-orchestration-result.model';
import { InstrumentType } from '../../common/enums/instrument-type.enum';
import { subtractCalendarDays } from '../../common/utils/market-time';
import { InstrumentsService } from '../../instruments/instruments.service';
import { elapsedMilliseconds, structuredError } from '../../logging/logging.utils';
import { MarketDataService } from '../../market-data/market-data.service';
import { UpstoxTokenService } from '../../providers/upstox/auth/upstox-token.service';
import { MARKET_REGIME_V1_CONFIG } from '../../market-regime/config/market-regime-v1.config';
import { ScannerService } from '../../scanner/scanner.service';
import { DailyPipelineRun } from '../entities/daily-pipeline-run.entity';
import { CANDIDATE_ANALYSIS } from '../job-names';
import {
  CandidateAnalysisJobData,
  CandidateAnalysisSummary,
  CandidateFailureStage,
  DAILY_PIPELINE_VERSION,
  DailyPipelineStatus,
  JobTriggerSource,
  PostMarketJobData,
} from '../models/job-data.model';
import { CANDIDATE_ANALYSIS_QUEUE } from '../queues';
import { TradingDayService } from './trading-day.service';
import { PipelineJobSummaryService } from './pipeline-job-summary.service';
import { PipelineJobSummaryDispatch } from '../models/pipeline-job-summary.model';

interface PipelineMetadata extends Record<string, unknown> {
  activeJobId?: string;
  activeRequestedAt?: string;
  processedCandidateIds?: string[];
  failedCandidateIds?: string[];
  orchestrationFailures?: Array<{ scanResultId: string; message: string }>;
  failureStageByCandidate?: Record<string, CandidateFailureStage>;
}

@Injectable()
export class DailyPipelineService {
  private readonly logger = new Logger(DailyPipelineService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DailyPipelineRun) private readonly runs: Repository<DailyPipelineRun>,
    private readonly config: ConfigService,
    private readonly instruments: InstrumentsService,
    private readonly marketData: MarketDataService,
    private readonly upstoxTokens: UpstoxTokenService,
    private readonly tradingDays: TradingDayService,
    private readonly scanner: ScannerService,
    private readonly candidateOrchestration: CandidateOrchestrationService,
    @InjectQueue(CANDIDATE_ANALYSIS_QUEUE)
    private readonly candidateQueue: Queue<CandidateAnalysisJobData>,
    private readonly pipelineJobSummary: PipelineJobSummaryService,
  ) {}

  async run(data: PostMarketJobData, job?: Job): Promise<Record<string, unknown>> {
    const marketDate = data.marketDate as string;
    const universeCode = this.config.getOrThrow<string>('marketData.universe');
    if (this.config.getOrThrow<string>('providers.marketData') === 'upstox') {
      const auth = await this.upstoxTokens.getStatus();
      if (!auth.authenticated) {
        this.logger.warn(
          {
            event: 'job.skipped',
            operation: 'postMarketPipeline',
            marketDate,
            reason: 'UPSTOX_AUTH_REQUIRED',
            triggerSource: data.triggerSource,
          },
          'Post-market pipeline skipped because Upstox authentication is required',
        );
        return { status: 'UPSTOX_AUTH_REQUIRED', marketDate };
      }
    }
    if (!(await this.tradingDays.isTradingDay(marketDate))) {
      this.logger.log(
        {
          event: 'job.skipped',
          operation: 'postMarketPipeline',
          marketDate,
          reason: 'SKIPPED_NON_TRADING_DAY',
          triggerSource: data.triggerSource,
        },
        'Post-market pipeline skipped on non-trading day',
      );
      return { status: 'SKIPPED_NON_TRADING_DAY', marketDate };
    }

    const dispatch = this.dispatch(data, job, marketDate);
    const executionKey = data.forceRun ? dispatch.jobId : 'daily';
    const claim = await this.claim(
      marketDate,
      universeCode,
      executionKey,
      data.triggerSource,
      dispatch,
      job?.id !== undefined,
    );
    if (claim.reused) {
      if (
        claim.run.status === DailyPipelineStatus.SUCCESS ||
        claim.run.status === DailyPipelineStatus.PARTIAL
      ) {
        await this.sendJobSummary(claim.run.id, dispatch);
      }
      return { status: claim.run.status, pipelineRunId: claim.run.id, reused: true };
    }
    const run = claim.run;
    const startedAt = performance.now();
    this.logger.log(
      {
        event: 'daily_pipeline.started',
        pipelineRunId: run.id,
        marketDate,
        version: DAILY_PIPELINE_VERSION,
        triggerSource: data.triggerSource,
      },
      'Daily pipeline started',
    );
    try {
      await job?.updateProgress(10);
      await this.runs.update(run.id, { marketDataStatus: 'SYNCING' });
      const sync = await this.syncAndValidateMarketData(marketDate);
      run.metadata = { ...run.metadata, marketData: sync };
      run.marketDataStatus = 'CURRENT';
      await this.runs.save(run);
      this.logger.log(
        {
          event: 'daily_pipeline.market_data.completed',
          pipelineRunId: run.id,
          marketDate,
          instrumentCount: sync.instrumentCount,
        },
        'Daily market data completed',
      );

      await job?.updateProgress(25);
      const scan = await this.scanner.runDailyScan(new Date(), run.executionKey);
      if (scan.run.marketDate !== marketDate) {
        throw new Error(`Scanner resolved ${scan.run.marketDate}; expected ${marketDate}`);
      }
      await this.runs.update(run.id, { scannerRunId: scan.run.id });
      this.logger.log(
        {
          event: 'daily_pipeline.scanner.completed',
          pipelineRunId: run.id,
          scannerRunId: scan.run.id,
          marketDate,
          shortlistCount: scan.shortlist.length,
        },
        'Daily scanner completed',
      );

      await job?.updateProgress(55);
      const candidates: Array<{ candidateId: string; evidenceHash: string }> = [];
      let created = 0;
      let riskRejected = 0;
      const orchestrationFailures: Array<{ scanResultId: string; message: string }> = [];
      for (const result of scan.shortlist) {
        try {
          const outcome = await this.candidateOrchestration.createFromScanResult(result.id);
          if (outcome.outcome === CandidateOrchestrationOutcome.RISK_REJECTED) {
            riskRejected += 1;
            continue;
          }
          if (!outcome.candidateId || !outcome.candidate) {
            throw new Error('Candidate orchestration returned no candidate identity');
          }
          if (outcome.created) created += 1;
          candidates.push({
            candidateId: outcome.candidateId,
            evidenceHash: createHash('sha256')
              .update(
                stableStringify({
                  candidateId: outcome.candidate.id,
                  scanResultId: outcome.candidate.scanResultId,
                  technicalSnapshot: outcome.candidate.technicalSnapshot,
                  riskSnapshot: outcome.candidate.riskSnapshot,
                }),
              )
              .digest('hex'),
          });
        } catch (error: unknown) {
          orchestrationFailures.push({
            scanResultId: result.id,
            message: error instanceof Error ? error.message : 'Candidate orchestration failed',
          });
        }
      }

      await this.runs.update(run.id, {
        candidatesCreated: created,
        candidatesRiskRejected: riskRejected,
        candidatesTotal: candidates.length,
        candidateAnalysisFailures: orchestrationFailures.length,
        metadata: { ...run.metadata, orchestrationFailures },
      });
      this.logger.log(
        {
          event: 'daily_pipeline.candidates.completed',
          pipelineRunId: run.id,
          scannerRunId: scan.run.id,
          marketDate,
          candidatesCreated: created,
          candidatesRiskRejected: riskRejected,
          candidateJobs: candidates.length,
          orchestrationFailures: orchestrationFailures.length,
        },
        'Daily candidates completed',
      );

      for (const candidate of candidates) {
        await this.candidateQueue.add(
          CANDIDATE_ANALYSIS,
          {
            pipelineRunId: run.id,
            candidateId: candidate.candidateId,
            marketDate,
            evidenceHash: candidate.evidenceHash,
          },
          {
            jobId: `candidate-analysis-${candidate.candidateId}-${candidate.evidenceHash}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: { count: 1000 },
            removeOnFail: false,
          },
        );
      }
      await job?.updateProgress(candidates.length ? 60 : 100);
      if (!candidates.length) await this.finalizeIfComplete(run.id);
      return {
        status: 'CANDIDATE_ANALYSIS_ENQUEUED',
        pipelineRunId: run.id,
        scannerRunId: scan.run.id,
        candidateJobs: candidates.length,
      };
    } catch (error: unknown) {
      await this.fail(run.id, error);
      this.logger.error(
        {
          event: 'daily_pipeline.failed',
          pipelineRunId: run.id,
          marketDate,
          durationMs: elapsedMilliseconds(startedAt),
          ...structuredError(error),
        },
        'Daily pipeline failed',
      );
      throw error;
    }
  }

  async hasSuccessfulRun(marketDate: string): Promise<boolean> {
    return this.runs.existsBy({
      marketDate,
      version: DAILY_PIPELINE_VERSION,
      universeCode: this.config.getOrThrow<string>('marketData.universe'),
      executionKey: 'daily',
      status: DailyPipelineStatus.SUCCESS,
    });
  }

  async recordCandidateSuccess(runId: string, summary: CandidateAnalysisSummary): Promise<void> {
    const recovered = await this.recoverCandidateFailure(runId, summary);
    if (recovered) return;
    await this.recordCandidate(runId, summary.candidateId, (run) => {
      this.addSummary(run, summary);
    });
  }

  async recordCandidateFailure(
    runId: string,
    candidateId: string,
    stage: CandidateFailureStage,
    message: string,
  ): Promise<void> {
    await this.recordCandidate(runId, candidateId, (run) => {
      run.candidateAnalysisFailures += 1;
      if (stage === 'NEWS') run.newsFailures += 1;
      if (stage === 'AI' || stage === 'DECISION') run.aiFailures += 1;
      if (stage === 'NOTIFICATION') run.notificationFailures += 1;
      const metadata = run.metadata as PipelineMetadata;
      metadata.failedCandidateIds = [...(metadata.failedCandidateIds ?? []), candidateId];
      metadata.failureStageByCandidate = {
        ...(metadata.failureStageByCandidate ?? {}),
        [candidateId]: stage,
      };
      metadata.lastCandidateError = message.slice(0, 1000);
      run.metadata = metadata;
    });
  }

  private async syncAndValidateMarketData(marketDate: string) {
    await this.marketData.syncInstruments();
    const universeCode = this.config.getOrThrow<string>('marketData.universe');
    const instruments = await this.instruments.list({ universe: universeCode, active: 'true' });
    const lookbackDays = this.config.getOrThrow<number>('scheduler.marketDataLookbackDays');
    const from = subtractCalendarDays(marketDate, lookbackDays);
    for (const instrument of instruments)
      await this.marketData.refresh(instrument.id, from, marketDate);

    const requiredSymbols = [
      ...MARKET_REGIME_V1_CONFIG.indexSymbols.nifty,
      ...MARKET_REGIME_V1_CONFIG.indexSymbols.vix,
    ];
    const required = instruments.filter(
      (instrument) =>
        instrument.type === InstrumentType.INDEX &&
        requiredSymbols.includes(instrument.symbol as never),
    );
    for (const symbol of requiredSymbols) {
      if (!required.some((instrument) => instrument.symbol === symbol)) {
        throw new Error(`Required benchmark ${symbol} is absent from ${universeCode}`);
      }
    }
    for (const instrument of required) {
      const quality = await this.marketData.quality(instrument.id, marketDate, marketDate);
      if (
        quality.validity !== 'VALID' ||
        quality.completeness !== 'COMPLETE' ||
        !quality.dataAvailable ||
        quality.lastStoredSession !== marketDate
      ) {
        throw new Error(
          `Required benchmark ${instrument.symbol} is not complete and valid for ${marketDate}`,
        );
      }
    }
    return {
      universe: universeCode,
      instrumentCount: instruments.length,
      from,
      to: marketDate,
      requiredBenchmarks: required.map((instrument) => instrument.symbol),
    };
  }

  private async claim(
    marketDate: string,
    universeCode: string,
    executionKey: string,
    triggerSource: JobTriggerSource,
    dispatch: PipelineJobSummaryDispatch,
    allowResume: boolean,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('LOCK TABLE daily_pipeline_runs IN SHARE ROW EXCLUSIVE MODE');
      const repository = manager.getRepository(DailyPipelineRun);
      const existing = await repository.findOneBy({
        marketDate,
        version: DAILY_PIPELINE_VERSION,
        universeCode,
        executionKey,
      });
      if (
        existing?.status === DailyPipelineStatus.SUCCESS ||
        existing?.status === DailyPipelineStatus.PARTIAL
      )
        return { run: existing, reused: true };
      if (existing?.status === DailyPipelineStatus.STARTED) {
        const owner = (existing.metadata as PipelineMetadata).activeJobId;
        if (!allowResume || owner !== dispatch.jobId) return { run: existing, reused: true };
      }
      if (existing) {
        Object.assign(existing, this.initialValues(triggerSource, dispatch), {
          universeCode,
          executionKey,
          startedAt: new Date(),
        });
        return { run: await repository.save(existing), reused: false };
      }
      const run = repository.create({
        id: randomUUID(),
        marketDate,
        version: DAILY_PIPELINE_VERSION,
        universeCode,
        executionKey,
        ...this.initialValues(triggerSource, dispatch),
        startedAt: new Date(),
      });
      return { run: await repository.save(run), reused: false };
    });
  }

  private initialValues(triggerSource: JobTriggerSource, dispatch: PipelineJobSummaryDispatch) {
    return {
      status: DailyPipelineStatus.STARTED,
      triggerSource,
      completedAt: null,
      marketDataStatus: 'PENDING',
      scannerRunId: null,
      candidatesCreated: 0,
      candidatesRiskRejected: 0,
      candidatesTotal: 0,
      candidatesProcessed: 0,
      candidateAnalysisFailures: 0,
      newsEnriched: 0,
      fastAnalyzed: 0,
      deepAnalyzed: 0,
      qualified: 0,
      waitCount: 0,
      rejected: 0,
      notified: 0,
      newsFailures: 0,
      aiFailures: 0,
      notificationFailures: 0,
      errorMessage: null,
      metadata: {
        activeJobId: dispatch.jobId,
        activeRequestedAt: dispatch.requestedAt,
      },
    } as const;
  }

  private dispatch(
    data: PostMarketJobData,
    job: Job | undefined,
    marketDate: string,
  ): PipelineJobSummaryDispatch {
    return {
      jobId: job?.id === undefined ? `direct-${marketDate}` : String(job.id),
      triggerSource: data.triggerSource,
      requestedAt: data.requestedAt ?? new Date().toISOString(),
    };
  }

  private async recordCandidate(
    runId: string,
    candidateId: string,
    update: (run: DailyPipelineRun) => void,
  ): Promise<void> {
    const completed = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(DailyPipelineRun);
      const run = await repository.findOne({
        where: { id: runId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!run || run.status === DailyPipelineStatus.FAILED) return false;
      const metadata = run.metadata as PipelineMetadata;
      const processed = metadata.processedCandidateIds ?? [];
      if (processed.includes(candidateId)) return Boolean(run.completedAt);
      update(run);
      run.candidatesProcessed += 1;
      run.metadata = { ...run.metadata, processedCandidateIds: [...processed, candidateId] };
      if (run.candidatesProcessed >= run.candidatesTotal) {
        run.status =
          run.candidateAnalysisFailures > 0
            ? DailyPipelineStatus.PARTIAL
            : DailyPipelineStatus.SUCCESS;
        run.completedAt = new Date();
      }
      await repository.save(run);
      if (run.completedAt) this.logCompletion(run);
      return Boolean(run.completedAt);
    });
    if (completed) await this.sendJobSummary(runId);
  }

  private async recoverCandidateFailure(
    runId: string,
    summary: CandidateAnalysisSummary,
  ): Promise<boolean> {
    const recovered = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(DailyPipelineRun);
      const run = await repository.findOne({
        where: { id: runId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!run) return false;
      const metadata = run.metadata as PipelineMetadata;
      const failed = metadata.failedCandidateIds ?? [];
      if (!failed.includes(summary.candidateId)) return false;
      const stage = metadata.failureStageByCandidate?.[summary.candidateId];
      run.candidateAnalysisFailures = Math.max(0, run.candidateAnalysisFailures - 1);
      if (stage === 'NEWS') run.newsFailures = Math.max(0, run.newsFailures - 1);
      if (stage === 'AI' || stage === 'DECISION') run.aiFailures = Math.max(0, run.aiFailures - 1);
      if (stage === 'NOTIFICATION')
        run.notificationFailures = Math.max(0, run.notificationFailures - 1);
      this.addSummary(run, summary);
      const stages = { ...(metadata.failureStageByCandidate ?? {}) };
      delete stages[summary.candidateId];
      run.metadata = {
        ...metadata,
        failedCandidateIds: failed.filter((id) => id !== summary.candidateId),
        failureStageByCandidate: stages,
      };
      run.status =
        run.candidateAnalysisFailures > 0
          ? DailyPipelineStatus.PARTIAL
          : DailyPipelineStatus.SUCCESS;
      run.completedAt = new Date();
      await repository.save(run);
      this.logCompletion(run);
      return true;
    });
    if (recovered) await this.sendJobSummary(runId);
    return recovered;
  }

  private addSummary(run: DailyPipelineRun, summary: CandidateAnalysisSummary): void {
    run.newsEnriched += Number(summary.newsEnriched);
    run.fastAnalyzed += Number(summary.fastAnalyzed);
    run.deepAnalyzed += Number(summary.deepAnalyzed);
    run.qualified += Number(summary.qualified);
    run.waitCount += Number(summary.wait);
    run.rejected += Number(summary.rejected);
    run.notified += Number(summary.notified);
    if (summary.analysisIssue) {
      run.candidateAnalysisFailures += 1;
      if (summary.analysisIssue.stage === 'NEWS') run.newsFailures += 1;
      if (summary.analysisIssue.stage === 'AI' || summary.analysisIssue.stage === 'DECISION') {
        run.aiFailures += 1;
      }
      const metadata = run.metadata as PipelineMetadata;
      metadata.failedCandidateIds = [...(metadata.failedCandidateIds ?? []), summary.candidateId];
      metadata.failureStageByCandidate = {
        ...(metadata.failureStageByCandidate ?? {}),
        [summary.candidateId]: summary.analysisIssue.stage,
      };
      metadata.lastCandidateError = `${summary.analysisIssue.kind}: ${summary.analysisIssue.code}`;
      run.metadata = metadata;
    }
  }

  private async finalizeIfComplete(runId: string): Promise<void> {
    const run = await this.runs.findOneByOrFail({ id: runId });
    run.status =
      run.candidateAnalysisFailures > 0 ? DailyPipelineStatus.PARTIAL : DailyPipelineStatus.SUCCESS;
    run.completedAt = new Date();
    await this.runs.save(run);
    this.logCompletion(run);
    await this.sendJobSummary(run.id);
  }

  private async sendJobSummary(
    runId: string,
    dispatch?: PipelineJobSummaryDispatch,
  ): Promise<void> {
    try {
      const summaryDispatch = dispatch ?? (await this.dispatchForRun(runId));
      await this.pipelineJobSummary.sendForRun(runId, summaryDispatch);
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'daily_pipeline.job_summary.failed',
          pipelineRunId: runId,
          ...structuredError(error),
        },
        'Daily pipeline completed but its WhatsApp job summary failed',
      );
    }
  }

  private async dispatchForRun(runId: string): Promise<PipelineJobSummaryDispatch> {
    const run = await this.runs.findOneByOrFail({ id: runId });
    const metadata = run.metadata as PipelineMetadata;
    return {
      jobId: metadata.activeJobId ?? `pipeline-${run.id}`,
      triggerSource: run.triggerSource,
      requestedAt: metadata.activeRequestedAt ?? run.startedAt.toISOString(),
    };
  }

  private async fail(runId: string, error: unknown): Promise<void> {
    const current = await this.runs.findOneBy({ id: runId });
    await this.runs.update(runId, {
      status: DailyPipelineStatus.FAILED,
      completedAt: new Date(),
      marketDataStatus: current?.marketDataStatus === 'CURRENT' ? 'CURRENT' : 'FAILED',
      errorMessage: (error instanceof Error ? error.message : 'Unknown failure').slice(0, 4000),
    });
  }

  private logCompletion(run: DailyPipelineRun): void {
    this.logger.log(
      {
        event: 'daily_pipeline.analysis.completed',
        pipelineRunId: run.id,
        marketDate: run.marketDate,
        newsEnriched: run.newsEnriched,
        fastAnalyzed: run.fastAnalyzed,
        deepAnalyzed: run.deepAnalyzed,
        candidateAnalysisFailures: run.candidateAnalysisFailures,
      },
      'Daily candidate analysis completed',
    );
    this.logger.log(
      {
        event: 'daily_pipeline.notifications.completed',
        pipelineRunId: run.id,
        marketDate: run.marketDate,
        qualified: run.qualified,
        wait: run.waitCount,
        rejected: run.rejected,
        notified: run.notified,
        notificationFailures: run.notificationFailures,
      },
      'Daily notifications completed',
    );
    const event =
      run.status === DailyPipelineStatus.PARTIAL
        ? 'daily_pipeline.partial'
        : 'daily_pipeline.completed';
    this.logger.log(
      {
        event,
        pipelineRunId: run.id,
        marketDate: run.marketDate,
        scannerRunId: run.scannerRunId,
        candidatesProcessed: run.candidatesProcessed,
        candidateAnalysisFailures: run.candidateAnalysisFailures,
        newsFailures: run.newsFailures,
        aiFailures: run.aiFailures,
        notificationFailures: run.notificationFailures,
        status: run.status,
      },
      'Daily pipeline completed',
    );
  }
}
