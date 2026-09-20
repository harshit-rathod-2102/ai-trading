import { randomUUID } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { InstrumentType } from '../common/enums/instrument-type.enum';
import { IndicatorsService } from '../indicators/indicators.service';
import { IndicatorCandle } from '../indicators/models/indicator-candle.model';
import { InstrumentsService } from '../instruments/instruments.service';
import { Instrument } from '../instruments/entities/instrument.entity';
import { DailyCandle } from '../market-data/entities/daily-candle.entity';
import { MarketDataService } from '../market-data/market-data.service';
import { marketDate } from '../market-data/market-data.validation';
import { calculateBreadthSnapshot } from './calculations/breadth-score';
import { calculateMarketRegime } from './calculations/calculate-regime';
import { MarketRegimeInputError } from './calculations/numeric';
import { calculateSectorParticipationSnapshot } from './calculations/sector-participation-score';
import { MARKET_REGIME_V1_CONFIG } from './config/market-regime-v1.config';
import { MarketRegimeSnapshot } from './entities/market-regime-snapshot.entity';
import { UniverseIndicatorObservation } from './models/breadth.model';
import { MarketRegimeInput, MarketDataFreshness } from './models/market-regime-input.model';
import { MarketRegimeResult } from './models/market-regime-result.model';
import { elapsedMilliseconds, structuredError } from '../logging/logging.utils';

@Injectable()
export class MarketRegimeService {
  private readonly logger = new Logger(MarketRegimeService.name);
  constructor(
    private readonly indicators: IndicatorsService,
    private readonly marketData: MarketDataService,
    private readonly instruments: InstrumentsService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  calculateRegime(input: MarketRegimeInput): MarketRegimeResult {
    return calculateMarketRegime(input);
  }

  async calculateCurrentRegime(now = new Date()): Promise<MarketRegimeResult> {
    const startedAt = performance.now();
    try {
      const universeCode = this.config.getOrThrow<string>('marketData.universe');
      const universe = await this.instruments.list({ universe: universeCode, active: 'true' });
      const nifty = this.findIndex(universe, MARKET_REGIME_V1_CONFIG.indexSymbols.nifty);
      if (!nifty)
        throw new MarketRegimeInputError(
          `Configured universe ${universeCode} has no NIFTY 50 index`,
        );
      const to = marketDate(now);
      const fromDate = new Date(to + 'T00:00:00.000Z');
      fromDate.setUTCDate(fromDate.getUTCDate() - 365);
      const from = fromDate.toISOString().slice(0, 10);
      const niftyQuality = await this.marketData.quality(nifty.id, from, to);
      if (
        niftyQuality.freshness !== 'CURRENT' ||
        niftyQuality.validity !== 'VALID' ||
        niftyQuality.completeness !== 'COMPLETE' ||
        !niftyQuality.latestExpectedSession
      ) {
        throw new MarketRegimeInputError(
          `NIFTY 50 data is not usable: freshness=${niftyQuality.freshness}, ` +
            `validity=${niftyQuality.validity}, completeness=${niftyQuality.completeness}`,
        );
      }

      const vix = this.findIndex(universe, MARKET_REGIME_V1_CONFIG.indexSymbols.vix);
      const rows = await this.marketData.listMany(
        universe.map((instrument) => instrument.id),
        from,
        to,
      );
      const byInstrument = this.groupCandles(rows);
      const niftyIndicators = this.indicators.calculateTechnicalSnapshot(
        this.toIndicatorCandles(byInstrument.get(nifty.id) ?? []),
      );
      const warnings = niftyQuality.warnings.map((warning: string) => `NIFTY_DATA:${warning}`);
      let vixIndicators;
      let vixFreshness: MarketDataFreshness | undefined;
      if (vix) {
        try {
          const quality = await this.marketData.quality(vix.id, from, to);
          vixFreshness = quality.freshness as MarketDataFreshness;
          if (quality.freshness === 'CURRENT' && quality.validity === 'VALID') {
            vixIndicators = this.indicators.calculateTechnicalSnapshot(
              this.toIndicatorCandles(byInstrument.get(vix.id) ?? []),
            );
          } else
            warnings.push(`INDIA_VIX_DATA_NOT_USABLE:${quality.validity}:${quality.completeness}`);
        } catch {
          vixFreshness = 'UNKNOWN';
          warnings.push('INDIA_VIX_QUALITY_UNAVAILABLE');
        }
      }

      const observations: UniverseIndicatorObservation[] = [];
      for (const instrument of universe.filter((item) => item.type === InstrumentType.EQUITY)) {
        try {
          observations.push({
            instrumentId: instrument.id,
            sector: instrument.sector,
            indicators: this.indicators.calculateTechnicalSnapshot(
              this.toIndicatorCandles(byInstrument.get(instrument.id) ?? []),
            ),
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'unknown indicator failure';
          warnings.push(`UNIVERSE_INSTRUMENT_EXCLUDED:${instrument.symbol}:${message}`);
        }
      }
      const marketDateValue = niftyQuality.latestExpectedSession as string;
      const result = this.calculateRegime({
        marketDate: marketDateValue,
        calculatedAt: now,
        niftyFreshness: 'CURRENT',
        niftyIndicators,
        vixFreshness,
        vixIndicators,
        breadth: calculateBreadthSnapshot(observations),
        sectorParticipation: calculateSectorParticipationSnapshot(observations),
        warnings,
      });
      await this.persist(result);
      this.logger.log(
        {
          event: 'market_regime.calculated',
          module: MarketRegimeService.name,
          operation: 'calculateCurrentRegime',
          regime: result.regime,
          score: result.score,
          confidence: result.confidence,
          version: result.version,
          marketDate: result.marketDate,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'completed',
        },
        'Market regime calculated',
      );
      this.logger.debug(
        {
          event: 'market_regime.components',
          module: MarketRegimeService.name,
          marketDate: result.marketDate,
          version: result.version,
          ...result.components,
        },
        'Market regime components calculated',
      );
      return result;
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'market_regime.failed',
          module: MarketRegimeService.name,
          operation: 'calculateCurrentRegime',
          durationMs: elapsedMilliseconds(startedAt),
          ...structuredError(error),
        },
        'Market regime calculation failed',
      );
      if (error instanceof MarketRegimeInputError || error instanceof RangeError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }
  }

  private findIndex(
    universe: readonly Instrument[],
    symbols: readonly string[],
  ): Instrument | undefined {
    return universe.find(
      (instrument) =>
        instrument.type === InstrumentType.INDEX && symbols.includes(instrument.symbol),
    );
  }

  private groupCandles(rows: readonly DailyCandle[]): Map<string, DailyCandle[]> {
    const grouped = new Map<string, DailyCandle[]>();
    for (const row of rows) {
      const candles = grouped.get(row.instrumentId) ?? [];
      candles.push(row);
      grouped.set(row.instrumentId, candles);
    }
    return grouped;
  }

  private toIndicatorCandles(rows: readonly DailyCandle[]): IndicatorCandle[] {
    return rows.map((row) => ({
      timestamp: new Date(row.sessionDate + 'T00:00:00.000Z'),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    }));
  }

  private async persist(result: MarketRegimeResult): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query('LOCK TABLE market_regime_snapshots IN SHARE ROW EXCLUSIVE MODE');
      const repository = manager.getRepository(MarketRegimeSnapshot);
      const current = await repository.findOneBy({
        marketDate: result.marketDate,
        version: result.version,
      });
      const snapshot = repository.create({
        id: current?.id ?? randomUUID(),
        marketDate: result.marketDate,
        regime: result.regime,
        score: result.score,
        confidence: result.confidence,
        version: result.version,
        components: result.components,
        reasons: [...result.reasons],
        warnings: [...result.warnings],
        calculatedAt: result.calculatedAt,
      });
      if (current) await repository.update(current.id, snapshot);
      else await repository.insert(snapshot);
    });
  }
}
