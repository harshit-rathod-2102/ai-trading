import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CandidateStatus } from '../common/enums/candidate-status.enum';
import { EventSource } from '../common/enums/event-source.enum';
import { TradeEventType } from '../common/enums/trade-event-type.enum';
import { JournalService } from '../journal/journal.service';
import { elapsedMilliseconds, structuredError } from '../logging/logging.utils';
import { RiskPlanResult } from '../risk/models/risk-plan-result.model';
import { RiskService } from '../risk/risk.service';
import { ScanResultRecord } from '../scanner/entities/scan-result.entity';
import { ScanStatus } from '../scanner/models/scan-status.enum';
import { CANDIDATE_ORCHESTRATION_V1_CONFIG as config } from './config/candidate-orchestration-v1.config';
import { TradeCandidate } from './entities/trade-candidate.entity';
import {
  CandidateOrchestrationErrorCode,
  CandidateOrchestrationOutcome,
  CandidateOrchestrationResult,
} from './models/candidate-orchestration-result.model';

@Injectable()
export class CandidateOrchestrationService {
  private readonly logger = new Logger(CandidateOrchestrationService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TradeCandidate)
    private readonly candidates: Repository<TradeCandidate>,
    @InjectRepository(ScanResultRecord)
    private readonly scanResults: Repository<ScanResultRecord>,
    private readonly risk: RiskService,
    private readonly journal: JournalService,
  ) {}

  async createFromScanResult(
    scanResultId: string,
    evaluatedAt = new Date(),
  ): Promise<CandidateOrchestrationResult> {
    const startedAt = performance.now();
    let record: ScanResultRecord | undefined;
    this.logger.log(
      {
        event: 'candidate.orchestration.started',
        module: CandidateOrchestrationService.name,
        operation: 'createFromScanResult',
        scanResultId,
        orchestrationVersion: config.version,
      },
      'Candidate orchestration started',
    );

    try {
      record =
        (await this.scanResults.findOne({
          where: { id: scanResultId },
          relations: { scanRun: true },
        })) ?? undefined;
      if (!record) {
        throw new NotFoundException({
          code: CandidateOrchestrationErrorCode.SCAN_RESULT_NOT_FOUND,
          message: 'Scanner result was not found',
          scanResultId,
        });
      }

      const existing = await this.candidates.findOneBy({ scanResultId });
      if (existing) return this.alreadyExists(record, existing, startedAt);

      this.validateScanResult(record, evaluatedAt);
      const riskPlan = await this.risk.evaluateScannerResult(scanResultId, evaluatedAt);
      if (!riskPlan.accepted) {
        const result = this.result(CandidateOrchestrationOutcome.RISK_REJECTED, record, {
          riskAccepted: false,
          riskRejectionCodes: riskPlan.rejectionCodes,
          reason: riskPlan.reasons.join('; ') || 'Deterministic risk validation rejected the setup',
          riskPlan,
        });
        this.logger.warn(
          {
            event: 'candidate.orchestration.risk_rejected',
            ...this.logContext(record),
            riskVersion: riskPlan.riskVersion,
            rejectionCodes: riskPlan.rejectionCodes,
            durationMs: elapsedMilliseconds(startedAt),
            status: 'rejected',
          },
          'Candidate orchestration rejected by risk',
        );
        return result;
      }

      this.validateAcceptedRisk(riskPlan, record.id);
      const creation = await this.persistCandidate(record, riskPlan);
      if (!creation.created) return this.alreadyExists(record, creation.candidate, startedAt);

      const result = this.result(CandidateOrchestrationOutcome.CREATED, record, {
        candidateId: creation.candidate.id,
        riskAccepted: true,
        riskRejectionCodes: [],
        candidate: creation.candidate,
      });
      this.logger.log(
        {
          event: 'candidate.created',
          ...this.logContext(record),
          candidateId: creation.candidate.id,
          riskVersion: riskPlan.riskVersion,
          durationMs: elapsedMilliseconds(startedAt),
          status: CandidateStatus.NEW,
        },
        'Quant-qualified candidate created',
      );
      return result;
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'candidate.orchestration.failed',
          module: CandidateOrchestrationService.name,
          operation: 'createFromScanResult',
          scanResultId,
          ...(record ? this.logContext(record) : {}),
          durationMs: elapsedMilliseconds(startedAt),
          ...structuredError(error),
        },
        'Candidate orchestration failed',
      );
      throw error;
    }
  }

  private validateScanResult(record: ScanResultRecord, evaluatedAt: Date): void {
    const run = record.scanRun;
    if (!run || run.status !== ScanStatus.SUCCESS || !run.completedAt) {
      this.invalid(
        CandidateOrchestrationErrorCode.SCAN_NOT_COMPLETE,
        'Candidate creation requires a successfully completed scan',
        record.id,
      );
    }
    if (!record.isShortlisted) {
      this.invalid(
        CandidateOrchestrationErrorCode.SETUP_NOT_SHORTLISTED,
        'Scanner result is not shortlisted for candidate creation',
        record.id,
      );
    }
    if (
      !record.strategy?.trim() ||
      !record.strategyVersion?.trim() ||
      !isRecord(record.strategyResult) ||
      record.strategyResult.qualified !== true ||
      record.strategyResult.strategy !== record.strategy ||
      record.strategyResult.strategyVersion !== record.strategyVersion
    ) {
      this.invalid(
        CandidateOrchestrationErrorCode.SETUP_NOT_QUALIFIED,
        'Scanner result does not contain a consistent qualified strategy result',
        record.id,
      );
    }
    if (
      !isNonEmptyRecord(record.technicalSnapshot) ||
      !isNonEmptyRecord(record.rankingFeatures) ||
      !isPositiveRank(record.strategyRank) ||
      !isPositiveRank(record.strategyQualifiedCount) ||
      !isPositiveRank(record.globalRank) ||
      !isPositiveRank(record.globalQualifiedCount) ||
      !isScore(record.strategyScore) ||
      !isScore(record.rankingScore) ||
      !isScore(record.globalRankingScore) ||
      !isNonEmptyRecord(run.marketRegimeSnapshot) ||
      run.marketRegimeSnapshot.marketDate !== run.marketDate ||
      !run.scannerVersion?.trim()
    ) {
      this.invalid(
        CandidateOrchestrationErrorCode.MISSING_SCAN_EVIDENCE,
        'Scanner result is missing required technical, regime, strategy, or ranking evidence',
        record.id,
      );
    }
    const ageDays = marketDateAgeDays(run.marketDate, evaluatedAt);
    if (ageDays < 0 || ageDays > config.maxMarketDateAgeCalendarDays) {
      this.invalid(
        CandidateOrchestrationErrorCode.STALE_SCAN_RESULT,
        `Scanner result market date is outside the ${config.maxMarketDateAgeCalendarDays}-day creation window`,
        record.id,
      );
    }
  }

  private validateAcceptedRisk(riskPlan: RiskPlanResult, scanResultId: string): void {
    if (
      !riskPlan.accepted ||
      !riskPlan.proposedEntry ||
      !riskPlan.structuralStop ||
      !riskPlan.target1 ||
      !riskPlan.target2 ||
      riskPlan.recommendedQuantity <= 0 ||
      !isNonEmptyRecord(riskPlan.snapshot)
    ) {
      this.invalid(
        CandidateOrchestrationErrorCode.MISSING_SCAN_EVIDENCE,
        'Accepted risk plan is missing required candidate evidence',
        scanResultId,
      );
    }
  }

  private async persistCandidate(
    record: ScanResultRecord,
    riskPlan: RiskPlanResult,
  ): Promise<{ readonly candidate: TradeCandidate; readonly created: boolean }> {
    const run = record.scanRun;
    const marketRegimeSnapshot = jsonRecord(run.marketRegimeSnapshot);
    const strategySnapshot = jsonRecord(record.strategyResult);
    const rankingSnapshot = jsonRecord({
      scannerVersion: run.scannerVersion,
      marketDate: run.marketDate,
      rankingScore: record.rankingScore,
      globalRankingScore: record.globalRankingScore,
      strategyRank: record.strategyRank,
      strategyQualifiedCount: record.strategyQualifiedCount,
      globalRank: record.globalRank,
      globalQualifiedCount: record.globalQualifiedCount,
      shortlisted: record.isShortlisted,
      rankingFeatures: record.rankingFeatures,
    });
    const riskSnapshot = jsonRecord(riskPlan);
    const technicalSnapshot = jsonRecord(record.technicalSnapshot);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(TradeCandidate);
        const existing = await repository.findOne({
          where: { scanResultId: record.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (existing) return { candidate: existing, created: false };

        const candidate = repository.create({
          id: randomUUID(),
          scanRunId: run.id,
          scanResultId: record.id,
          marketDate: run.marketDate,
          scannerVersion: run.scannerVersion,
          symbol: record.symbol,
          exchange: record.exchange,
          sector: record.sector,
          strategy: record.strategy,
          strategyVersion: record.strategyVersion,
          status: CandidateStatus.NEW,
          detectedAt: run.completedAt as Date,
          proposedEntry: riskPlan.proposedEntry as string,
          proposedStop: riskPlan.structuralStop as string,
          target1: riskPlan.target1,
          target2: riskPlan.target2,
          suggestedQuantity: riskPlan.recommendedQuantity,
          quantScore: record.strategyScore,
          strategyScore: record.strategyScore,
          rankingScore: record.rankingScore,
          globalRankingScore: record.globalRankingScore,
          strategyRank: record.strategyRank,
          strategyQualifiedCount: record.strategyQualifiedCount,
          globalRank: record.globalRank,
          globalQualifiedCount: record.globalQualifiedCount,
          technicalSnapshot,
          marketRegimeSnapshot,
          strategySnapshot,
          rankingSnapshot,
          riskSnapshot,
          aiAnalysis: null,
        });
        await repository.save(candidate);
        await this.journal.record(manager, {
          candidateId: candidate.id,
          eventType: TradeEventType.CANDIDATE_CREATED,
          source: EventSource.SYSTEM,
          data: {
            scanRunId: run.id,
            scanResultId: record.id,
            strategy: record.strategy,
            strategyVersion: record.strategyVersion,
            rankingScore: record.rankingScore,
            riskVersion: riskPlan.riskVersion,
            orchestrationVersion: config.version,
          },
        });
        return {
          candidate: await repository.findOneByOrFail({ id: candidate.id }),
          created: true,
        };
      });
    } catch (error: unknown) {
      if (!isScanResultDuplicate(error)) throw error;
      const existing = await this.candidates.findOneBy({ scanResultId: record.id });
      if (!existing) throw error;
      return { candidate: existing, created: false };
    }
  }

  private alreadyExists(
    record: ScanResultRecord,
    candidate: TradeCandidate,
    startedAt: number,
  ): CandidateOrchestrationResult {
    this.logger.log(
      {
        event: 'candidate.already_exists',
        ...this.logContext(record),
        candidateId: candidate.id,
        durationMs: elapsedMilliseconds(startedAt),
        status: 'existing',
      },
      'Candidate already exists for scanner result',
    );
    return this.result(CandidateOrchestrationOutcome.ALREADY_EXISTS, record, {
      candidateId: candidate.id,
      riskAccepted: true,
      riskRejectionCodes: [],
      reason: 'A candidate already exists for this scanner result',
      candidate,
    });
  }

  private result(
    outcome: CandidateOrchestrationOutcome,
    record: ScanResultRecord,
    values: Omit<
      CandidateOrchestrationResult,
      | 'outcome'
      | 'created'
      | 'scanRunId'
      | 'scanResultId'
      | 'symbol'
      | 'strategy'
      | 'strategyVersion'
    >,
  ): CandidateOrchestrationResult {
    return {
      outcome,
      created: outcome === CandidateOrchestrationOutcome.CREATED,
      scanRunId: record.scanRunId,
      scanResultId: record.id,
      symbol: record.symbol,
      strategy: record.strategy,
      strategyVersion: record.strategyVersion,
      ...values,
    };
  }

  private logContext(record: ScanResultRecord): Record<string, unknown> {
    return {
      module: CandidateOrchestrationService.name,
      operation: 'createFromScanResult',
      scanRunId: record.scanRunId,
      scanResultId: record.id,
      symbol: record.symbol,
      strategy: record.strategy,
      strategyVersion: record.strategyVersion,
    };
  }

  private invalid(
    code: CandidateOrchestrationErrorCode,
    message: string,
    scanResultId: string,
  ): never {
    throw new UnprocessableEntityException({ code, message, scanResultId });
  }
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

function marketDateAgeDays(marketDate: string, evaluatedAt: Date): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(marketDate) || Number.isNaN(evaluatedAt.getTime()))
    return Infinity;
  const currentMarketDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(evaluatedAt);
  const current = Date.parse(`${currentMarketDate}T00:00:00.000Z`);
  const scan = Date.parse(`${marketDate}T00:00:00.000Z`);
  if (Number.isNaN(current) || Number.isNaN(scan)) return Infinity;
  return Math.round((current - scan) / 86_400_000);
}

function jsonRecord(value: unknown): Record<string, unknown> {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (!isRecord(parsed)) throw new TypeError('Candidate evidence snapshot must be a JSON object');
  return parsed;
}

function isScanResultDuplicate(error: unknown): boolean {
  if (!isRecord(error) || !isRecord(error.driverError)) return false;
  return (
    error.driverError.code === '23505' &&
    error.driverError.constraint === 'uq_trade_candidates_scan_result'
  );
}
