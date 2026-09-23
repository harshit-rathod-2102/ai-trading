import { randomUUID } from 'node:crypto';
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
import { Exchange } from '../common/enums/exchange.enum';
import { InstrumentType } from '../common/enums/instrument-type.enum';
import { IndicatorCandle } from '../indicators/models/indicator-candle.model';
import { Instrument } from '../instruments/entities/instrument.entity';
import { InstrumentsService } from '../instruments/instruments.service';
import { DailyCandle } from '../market-data/entities/daily-candle.entity';
import { MarketDataService } from '../market-data/market-data.service';
import { MARKET_REGIME_V1_CONFIG } from '../market-regime/config/market-regime-v1.config';
import { MarketRegimeResult } from '../market-regime/models/market-regime-result.model';
import { MarketRegimeService } from '../market-regime/market-regime.service';
import { StrategyName } from '../strategy/models/strategy-name.enum';
import { SCANNER_V1_CONFIG as scannerConfig } from './config/scanner-v1.config';
import { ScanResultsQueryDto } from './dto/scan-results-query.dto';
import { ScanResultRecord } from './entities/scan-result.entity';
import { ScanRun } from './entities/scan-run.entity';
import { RankedSetup, ScanExclusion } from './models/scan-result.model';
import { ScanStatus } from './models/scan-status.enum';
import { CrossSectionalRanking } from './ranking/cross-sectional-ranking';
import { ScannerEvaluationService } from './scanner-evaluation.service';
import { elapsedMilliseconds, structuredError } from '../logging/logging.utils';

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly instruments: InstrumentsService,
    private readonly marketData: MarketDataService,
    private readonly marketRegime: MarketRegimeService,
    private readonly evaluator: ScannerEvaluationService,
    private readonly ranking: CrossSectionalRanking,
    private readonly dataSource: DataSource,
    @InjectRepository(ScanRun) private readonly runs: Repository<ScanRun>,
    @InjectRepository(ScanResultRecord) private readonly results: Repository<ScanResultRecord>,
  ) {}

  async runDailyScan(now = new Date(), executionKey = 'daily') {
    // Regime is an essential preflight input. If it fails, no empty or misleading
    // scan run is created because a trustworthy market-date identity is unavailable.
    const universeCode = this.config.getOrThrow<string>('marketData.universe');
    const regime = await this.marketRegime.calculateCurrentRegime(now);
    const claim = await this.claimRun(regime, now, universeCode, executionKey);
    if (claim.reused) {
      this.logger.log(
        {
          event: 'scanner.reused',
          module: ScannerService.name,
          operation: 'runDailyScan',
          scanRunId: claim.run.id,
          marketDate: regime.marketDate,
          scannerVersion: scannerConfig.version,
          universeCode,
          executionKey,
          marketRegime: regime.regime,
          status: 'reused',
        },
        'Scanner run reused',
      );
      return this.getCompletedScan(claim.run.id, true);
    }
    const run = claim.run;
    const startedAt = performance.now();
    try {
      const universe = await this.instruments.list({ universe: universeCode });
      const equityUniverse = universe.filter(
        (instrument) =>
          instrument.exchange === Exchange.NSE && instrument.type === InstrumentType.EQUITY,
      );
      const activeEquities = equityUniverse.filter((instrument) => instrument.isActive);
      const excludedInactive = equityUniverse.length - activeEquities.length;
      this.logger.log(
        {
          event: 'scanner.started',
          module: ScannerService.name,
          operation: 'runDailyScan',
          scanRunId: run.id,
          marketDate: regime.marketDate,
          scannerVersion: scannerConfig.version,
          universeCode,
          executionKey,
          universeSize: equityUniverse.length,
          marketRegime: regime.regime,
          status: 'started',
        },
        'Scanner started',
      );
      const benchmark = this.findNifty(universe);
      if (!benchmark)
        throw new ServiceUnavailableException(
          `Configured universe ${universeCode} has no active NIFTY 50 benchmark`,
        );

      const from = this.historyStart(regime.marketDate);
      const instrumentIds = [benchmark.id, ...activeEquities.map((instrument) => instrument.id)];
      const rows = await this.marketData.listMany(instrumentIds, from, regime.marketDate);
      const grouped = this.groupCandles(rows);
      const benchmarkCandles = this.toIndicatorCandles(grouped.get(benchmark.id) ?? []);
      let evaluation;
      try {
        evaluation = this.evaluator.evaluate({
          benchmarkCandles,
          marketRegime: regime,
          evaluatedAt: now,
          instruments: activeEquities.map((instrument) => ({
            instrument,
            candles: this.toIndicatorCandles(grouped.get(instrument.id) ?? []),
          })),
        });
      } catch (error: unknown) {
        // Symbol-level errors are isolated inside ScannerEvaluationService, so
        // an error escaping here represents unusable shared scan context.
        throw new ServiceUnavailableException(
          `Scanner shared context is unavailable: ${this.message(error)}`,
        );
      }
      const ranked = this.ranking.rank(evaluation.qualifiedSetups);
      const completed = await this.completeRun(run, ranked, {
        totalUniverse: equityUniverse.length,
        eligibleUniverse: evaluation.eligibleUniverse,
        excludedInactive,
        evaluatedSymbols: evaluation.evaluatedSymbols,
        exclusions: evaluation.exclusions,
      });
      const counts = this.qualifiedCounts(ranked);
      this.logger.log(
        {
          event: 'scanner.completed',
          module: ScannerService.name,
          operation: 'runDailyScan',
          scanRunId: run.id,
          marketDate: regime.marketDate,
          scannerVersion: scannerConfig.version,
          universeCode,
          executionKey,
          universeSize: equityUniverse.length,
          evaluatedSymbols: evaluation.evaluatedSymbols,
          excludedSymbols: evaluation.exclusions.length + excludedInactive,
          momentumQualifiedCount: counts.MOMENTUM_BREAKOUT,
          pullbackQualifiedCount: counts.TREND_PULLBACK,
          totalQualifiedSetups: ranked.length,
          shortlistedSetups: completed.run.shortlistedSetups,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'completed',
        },
        'Scanner completed',
      );
      return completed;
    } catch (error: unknown) {
      await this.failRun(run.id, error);
      this.logger.error(
        {
          event: 'scanner.failed',
          module: ScannerService.name,
          operation: 'runDailyScan',
          scanRunId: run.id,
          marketDate: regime.marketDate,
          scannerVersion: scannerConfig.version,
          universeCode,
          executionKey,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'failed',
          ...structuredError(error),
        },
        'Scanner failed',
      );
      throw error;
    }
  }

  listRuns(): Promise<ScanRun[]> {
    return this.runs.find({ order: { marketDate: 'DESC', startedAt: 'DESC' }, take: 100 });
  }

  async getRun(id: string): Promise<ScanRun> {
    const run = await this.runs.findOneBy({ id });
    if (!run) throw new NotFoundException('Scanner run not found');
    return run;
  }

  async getResult(id: string): Promise<ScanResultRecord> {
    const result = await this.results.findOneBy({ id });
    if (!result) throw new NotFoundException('Scanner result not found');
    return result;
  }

  async listResults(id: string, filters: ScanResultsQueryDto = {}): Promise<ScanResultRecord[]> {
    await this.getRun(id);
    // Only qualified hypotheses are persisted in V1. This explicit behavior
    // lets callers ask for qualified=false without receiving misleading rows.
    if (filters.qualified === 'false') return [];
    const query = this.results.createQueryBuilder('result').where('result.scanRunId = :id', { id });
    if (filters.strategy)
      query.andWhere('result.strategy = :strategy', { strategy: filters.strategy });
    if (filters.shortlisted !== undefined) {
      query.andWhere('result.isShortlisted = :shortlisted', {
        shortlisted: filters.shortlisted === 'true',
      });
    }
    return query.orderBy('result.globalRank', 'ASC').addOrderBy('result.symbol', 'ASC').getMany();
  }

  async getCompletedScan(id: string, reused = false) {
    const [run, results] = await Promise.all([this.getRun(id), this.listResults(id)]);
    return { run, results, shortlist: results.filter((result) => result.isShortlisted), reused };
  }

  private async claimRun(
    regime: MarketRegimeResult,
    startedAt: Date,
    universeCode: string,
    executionKey: string,
  ): Promise<{ run: ScanRun; reused: boolean }> {
    const current = await this.runs.findOneBy({
      marketDate: regime.marketDate,
      scannerVersion: scannerConfig.version,
      universeCode,
      executionKey,
    });
    if (current?.status === ScanStatus.SUCCESS) return { run: current, reused: true };
    if (current?.status === ScanStatus.STARTED) {
      throw new ConflictException(
        `Scanner run already started for ${regime.marketDate} and ${scannerConfig.version}`,
      );
    }
    if (current?.status === ScanStatus.FAILED) {
      const claimed = await this.runs
        .createQueryBuilder()
        .update()
        .set({
          status: ScanStatus.STARTED,
          marketRegimeSnapshot: regime,
          startedAt,
          completedAt: null,
          errorMessage: null,
          exclusions: [],
          totalUniverse: 0,
          eligibleUniverse: 0,
          excludedInactive: 0,
          excludedInsufficientHistory: 0,
          excludedInvalidData: 0,
          evaluatedSymbols: 0,
          qualifiedSetups: 0,
          shortlistedSetups: 0,
        })
        .where('id = :id AND status = :status', { id: current.id, status: ScanStatus.FAILED })
        .execute();
      if (!claimed.affected)
        throw new ConflictException(
          `Scanner rerun is already in progress for ${regime.marketDate}`,
        );
      return { run: await this.getRun(current.id), reused: false };
    }
    const run = this.runs.create({
      id: randomUUID(),
      marketDate: regime.marketDate,
      scannerVersion: scannerConfig.version,
      universeCode,
      executionKey,
      status: ScanStatus.STARTED,
      marketRegimeSnapshot: regime,
      totalUniverse: 0,
      eligibleUniverse: 0,
      excludedInactive: 0,
      excludedInsufficientHistory: 0,
      excludedInvalidData: 0,
      evaluatedSymbols: 0,
      qualifiedSetups: 0,
      shortlistedSetups: 0,
      exclusions: [],
      startedAt,
      completedAt: null,
      errorMessage: null,
    });
    try {
      await this.runs.insert(run);
      return { run, reused: false };
    } catch (error: unknown) {
      if (!this.isDuplicate(error)) throw error;
      // The database uniqueness constraint is the final concurrency guard.
      return this.claimRun(regime, startedAt, universeCode, executionKey);
    }
  }

  private async completeRun(
    run: ScanRun,
    ranked: readonly RankedSetup[],
    counts: {
      totalUniverse: number;
      eligibleUniverse: number;
      excludedInactive: number;
      evaluatedSymbols: number;
      exclusions: readonly ScanExclusion[];
    },
  ) {
    const completedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      const resultRepository = manager.getRepository(ScanResultRecord);
      await resultRepository.delete({ scanRunId: run.id });
      if (ranked.length) {
        const records = ranked.map((setup) =>
          resultRepository.create({
            id: randomUUID(),
            scanRunId: run.id,
            instrumentId: setup.instrumentId,
            symbol: setup.symbol,
            exchange: setup.exchange,
            sector: setup.sector,
            strategy: setup.strategy,
            strategyVersion: setup.strategyVersion,
            strategyScore: setup.strategyScore,
            rankingScore: setup.rankingScore,
            globalRankingScore: setup.globalRankingScore,
            strategyRank: setup.strategyRank,
            strategyQualifiedCount: setup.strategyQualifiedCount,
            globalRank: setup.globalRank,
            globalQualifiedCount: setup.globalQualifiedCount,
            technicalSnapshot: setup.technicalSnapshot,
            strategyResult: setup.strategyResult,
            rankingFeatures: setup.rankingFeatures,
            isShortlisted: setup.isShortlisted,
          }),
        );
        await resultRepository.save(records, { chunk: 500 });
      }
      const insufficient = counts.exclusions.filter(
        (item) => item.code === 'INSUFFICIENT_HISTORY',
      ).length;
      const invalid = counts.exclusions.filter((item) => item.code === 'INVALID_DATA').length;
      await manager.getRepository(ScanRun).update(run.id, {
        status: ScanStatus.SUCCESS,
        totalUniverse: counts.totalUniverse,
        eligibleUniverse: counts.eligibleUniverse,
        excludedInactive: counts.excludedInactive,
        excludedInsufficientHistory: insufficient,
        excludedInvalidData: invalid,
        evaluatedSymbols: counts.evaluatedSymbols,
        qualifiedSetups: ranked.length,
        shortlistedSetups: ranked.filter((setup) => setup.isShortlisted).length,
        exclusions: [...counts.exclusions],
        completedAt,
        errorMessage: null,
      });
    });
    return this.getCompletedScan(run.id);
  }

  private async failRun(id: string, error: unknown): Promise<void> {
    await this.runs.update(id, {
      status: ScanStatus.FAILED,
      completedAt: new Date(),
      errorMessage: this.message(error).slice(0, 4000),
    });
  }

  private findNifty(universe: readonly Instrument[]): Instrument | undefined {
    return universe.find(
      (instrument) =>
        instrument.isActive &&
        instrument.exchange === Exchange.NSE &&
        instrument.type === InstrumentType.INDEX &&
        (MARKET_REGIME_V1_CONFIG.indexSymbols.nifty as readonly string[]).includes(
          instrument.symbol,
        ),
    );
  }

  private historyStart(marketDate: string): string {
    const date = new Date(`${marketDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - scannerConfig.historyCalendarDays);
    return date.toISOString().slice(0, 10);
  }

  private groupCandles(rows: readonly DailyCandle[]): Map<string, DailyCandle[]> {
    const grouped = new Map<string, DailyCandle[]>();
    for (const row of rows) {
      const group = grouped.get(row.instrumentId) ?? [];
      group.push(row);
      grouped.set(row.instrumentId, group);
    }
    return grouped;
  }

  private toIndicatorCandles(rows: readonly DailyCandle[]): IndicatorCandle[] {
    return rows.map((row) => ({
      timestamp: new Date(`${row.sessionDate}T00:00:00.000Z`),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    }));
  }

  private qualifiedCounts(ranked: readonly RankedSetup[]): Record<StrategyName, number> {
    return {
      [StrategyName.MOMENTUM_BREAKOUT]: ranked.filter(
        (item) => item.strategy === StrategyName.MOMENTUM_BREAKOUT,
      ).length,
      [StrategyName.TREND_PULLBACK]: ranked.filter(
        (item) => item.strategy === StrategyName.TREND_PULLBACK,
      ).length,
    };
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown scanner failure';
  }

  private isDuplicate(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'driverError' in error &&
      typeof error.driverError === 'object' &&
      error.driverError !== null &&
      'code' in error.driverError &&
      error.driverError.code === '23505'
    );
  }
}
