import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { EventSource } from '../common/enums/event-source.enum';
import { TradeEventType } from '../common/enums/trade-event-type.enum';
import { TradeStatus } from '../common/enums/trade-status.enum';
import { InstrumentsService } from '../instruments/instruments.service';
import { JournalService } from '../journal/journal.service';
import { TradeEvent } from '../journal/entities/trade-event.entity';
import { elapsedMilliseconds, structuredError } from '../logging/logging.utils';
import { MarketDataService } from '../market-data/market-data.service';
import { Trade } from '../trades/entities/trade.entity';
import { calculateExcursion } from './calculations/excursion';
import { detectTradeAlerts, DetectedTradeAlert } from './calculations/milestone-detection';
import { calculateTradeDistances } from './calculations/trade-distances';
import { calculateTradePnl } from './calculations/trade-pnl';
import { calculateRMultiple } from './calculations/trade-r-multiple';
import { TRADE_MONITOR_VERSION, tradeMonitorV1Config } from './config/trade-monitor-v1.config';
import { TradeAlertDeliveryStatus } from './models/trade-alert-type.enum';
import {
  TradeMonitorBatchResult,
  TradeMonitorFailure,
  TradeMonitorResult,
} from './models/trade-monitor-result.model';
import { TradeMonitorState } from './models/trade-monitor-state.model';
import { TradePriceSnapshot } from './models/trade-price-snapshot.model';
import { TradeMonitorAlertService } from './trade-monitor-alert.service';

const MONITOR_EVENT_TYPES = [
  TradeEventType.PRICE_MILESTONE_REACHED,
  TradeEventType.ADVERSE_MOVE_OBSERVED,
  TradeEventType.STOP_PROXIMITY_OBSERVED,
  TradeEventType.STOP_BREACHED_OBSERVED,
  TradeEventType.TARGET1_REACHED,
  TradeEventType.TARGET2_REACHED,
] as const;

@Injectable()
export class TradeMonitorService {
  private readonly logger = new Logger(TradeMonitorService.name);

  private readonly inFlight = new Map<string, Promise<TradeMonitorResult>>();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Trade) private readonly trades: Repository<Trade>,
    private readonly instruments: InstrumentsService,
    private readonly marketData: MarketDataService,
    private readonly journal: JournalService,
    private readonly alerts: TradeMonitorAlertService,
  ) {}

  monitorTrade(tradeId: string): Promise<TradeMonitorResult> {
    const current = this.inFlight.get(tradeId);
    if (current) return current;
    const execution = this.executeTrade(tradeId).finally(() => {
      if (this.inFlight.get(tradeId) === execution) this.inFlight.delete(tradeId);
    });
    this.inFlight.set(tradeId, execution);
    return execution;
  }

  async monitorOpenTrades(): Promise<TradeMonitorBatchResult> {
    const startedAt = new Date();
    const startedPerformance = performance.now();
    this.logger.log(
      {
        event: 'trade_monitor.batch.started',
        module: TradeMonitorService.name,
        operation: 'monitorOpenTrades',
        monitorVersion: TRADE_MONITOR_VERSION,
      },
      'Trade-monitor batch started',
    );
    try {
      const trades = await this.trades.find({
        where: { status: TradeStatus.OPEN },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      const results: TradeMonitorResult[] = [];
      const failures: TradeMonitorFailure[] = [];
      for (const trade of trades) {
        try {
          results.push(await this.monitorTrade(trade.id));
        } catch (error: unknown) {
          failures.push({
            tradeId: trade.id,
            symbol: trade.symbol,
            errorCode: errorCode(error),
            message: errorMessage(error),
          });
        }
      }
      const completedAt = new Date();
      const result: TradeMonitorBatchResult = {
        totalOpenTrades: trades.length,
        monitored: results.length,
        failed: failures.length,
        alertsGenerated: results.flatMap((item) => item.alerts).filter((alert) => alert.isNew)
          .length,
        alertsSent: results
          .flatMap((item) => item.alerts)
          .filter((alert) => alert.deliveryStatus === TradeAlertDeliveryStatus.SENT).length,
        alertDeliveryFailures: results
          .flatMap((item) => item.alerts)
          .filter((alert) => alert.deliveryStatus === TradeAlertDeliveryStatus.FAILED).length,
        failures,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: elapsedMilliseconds(startedPerformance),
      };
      this.logger.log(
        {
          event: 'trade_monitor.batch.completed',
          module: TradeMonitorService.name,
          operation: 'monitorOpenTrades',
          monitorVersion: TRADE_MONITOR_VERSION,
          totalOpenTrades: result.totalOpenTrades,
          monitored: result.monitored,
          failed: result.failed,
          alertsGenerated: result.alertsGenerated,
          durationMs: result.durationMs,
        },
        'Trade-monitor batch completed',
      );
      return result;
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'trade_monitor.batch.failed',
          module: TradeMonitorService.name,
          operation: 'monitorOpenTrades',
          monitorVersion: TRADE_MONITOR_VERSION,
          durationMs: elapsedMilliseconds(startedPerformance),
          ...structuredError(error),
        },
        'Trade-monitor batch failed',
      );
      throw error;
    }
  }

  private async executeTrade(tradeId: string): Promise<TradeMonitorResult> {
    const startedAt = performance.now();
    let symbol: string | undefined;
    this.logger.log(
      {
        event: 'trade_monitor.trade.started',
        module: TradeMonitorService.name,
        operation: 'monitorTrade',
        monitorVersion: TRADE_MONITOR_VERSION,
        tradeId,
      },
      'Trade monitoring started',
    );
    try {
      const initial = await this.trades.findOne({
        where: { id: tradeId },
        relations: { candidate: true },
      });
      if (!initial) throw new NotFoundException({ code: 'TRADE_NOT_FOUND', tradeId });
      symbol = initial.symbol;
      this.assertOpen(initial);
      const instrument = await this.instruments.findActiveByMarketIdentity(
        initial.symbol,
        initial.candidate.exchange,
      );
      const quote = await this.marketData.latestPrice(instrument.id);
      const price: TradePriceSnapshot = {
        price: quote.price,
        observedAt: quote.observedAt,
        provider: quote.provider,
        isSynthetic: quote.isSynthetic,
      };
      const monitoredAt = new Date();
      this.assertFreshPrice(price, monitoredAt);

      const persisted = await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(Trade);
        const locked = await repository.findOne({
          where: { id: tradeId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) throw new NotFoundException({ code: 'TRADE_NOT_FOUND', tradeId });
        this.assertOpen(locked);
        const previousPrice = locked.currentPrice;
        const state = calculateState(locked, price.price, monitoredAt);
        const existingEvents = await manager.getRepository(TradeEvent).find({
          where: { tradeId, eventType: In([...MONITOR_EVENT_TYPES]) },
        });
        const existingKeys = new Set(
          existingEvents
            .map((event) =>
              isRecord(event.data) && typeof event.data.monitorKey === 'string'
                ? event.data.monitorKey
                : '',
            )
            .filter(Boolean),
        );
        const detected = detectTradeAlerts(
          {
            currentPrice: price.price,
            currentStop: locked.currentStop,
            currentR: state.currentR,
            stopDistanceR: state.stopDistanceR,
            target1: locked.target1,
            target2: locked.target2,
          },
          tradeMonitorV1Config,
        ).filter((alert) => !existingKeys.has(alert.type));

        applyMonitoringState(locked, price, state, monitoredAt);
        const saved = await repository.save(locked);
        const newEvents: TradeEvent[] = [];
        for (const alert of detected) {
          newEvents.push(await this.recordAlert(manager, saved, alert, price, state, monitoredAt));
        }
        return { trade: saved, previousPrice, state, newEvents };
      });

      const alerts = await this.alerts.deliverPendingForTrade(
        persisted.trade,
        new Set(persisted.newEvents.map((event) => event.id)),
      );
      const result = toResult(
        persisted.trade,
        price,
        persisted.previousPrice,
        persisted.state,
        alerts,
        monitoredAt,
      );
      this.logger.log(
        {
          event: 'trade_monitor.trade.completed',
          module: TradeMonitorService.name,
          operation: 'monitorTrade',
          monitorVersion: TRADE_MONITOR_VERSION,
          tradeId,
          symbol: persisted.trade.symbol,
          provider: price.provider,
          currentPrice: price.price,
          currentR: persisted.state.currentR,
          alertsGenerated: persisted.newEvents.length,
          durationMs: elapsedMilliseconds(startedAt),
        },
        'Trade monitoring completed',
      );
      return result;
    } catch (error: unknown) {
      const fields = {
        event: 'trade_monitor.trade.failed',
        module: TradeMonitorService.name,
        operation: 'monitorTrade',
        monitorVersion: TRADE_MONITOR_VERSION,
        tradeId,
        ...(symbol ? { symbol } : {}),
        durationMs: elapsedMilliseconds(startedAt),
        ...structuredError(error),
      };
      if (['STALE_MARKET_PRICE', 'INVALID_MARKET_PRICE'].includes(errorCode(error))) {
        this.logger.warn(fields, 'Trade monitoring skipped unsafe market price');
      } else {
        this.logger.error(fields, 'Trade monitoring failed');
      }
      throw error;
    }
  }

  private assertOpen(trade: Trade): void {
    if (trade.status !== TradeStatus.OPEN) {
      throw new ConflictException({
        code: 'TRADE_NOT_OPEN',
        tradeId: trade.id,
        message: `Trade in ${trade.status} status cannot be monitored`,
      });
    }
  }

  private assertFreshPrice(price: TradePriceSnapshot, now: Date): void {
    const observedAt = new Date(price.observedAt);
    if (Number.isNaN(observedAt.getTime())) {
      throw new ServiceUnavailableException({
        code: 'INVALID_MARKET_PRICE',
        message: 'Provider price timestamp is invalid',
      });
    }
    const age = now.getTime() - observedAt.getTime();
    if (
      age > tradeMonitorV1Config.maxPriceAgeMs ||
      age < -tradeMonitorV1Config.maxFuturePriceSkewMs
    ) {
      throw new ServiceUnavailableException({
        code: 'STALE_MARKET_PRICE',
        message: 'Provider price is outside the accepted freshness window',
        provider: price.provider,
        observedAt: price.observedAt,
      });
    }
  }

  private recordAlert(
    manager: Parameters<JournalService['record']>[0],
    trade: Trade,
    alert: DetectedTradeAlert,
    price: TradePriceSnapshot,
    state: TradeMonitorState,
    monitoredAt: Date,
  ): Promise<TradeEvent> {
    return this.journal.record(manager, {
      candidateId: trade.candidateId,
      tradeId: trade.id,
      eventType: alert.eventType,
      source: EventSource.SYSTEM,
      price: price.price,
      quantity: trade.quantity,
      data: {
        monitorVersion: TRADE_MONITOR_VERSION,
        monitorKey: alert.type,
        alertType: alert.type,
        severity: alert.severity,
        provider: price.provider,
        providerObservedAt: price.observedAt,
        monitoredAt: monitoredAt.toISOString(),
        currentR: state.currentR,
        unrealizedPnl: state.unrealizedPnl,
        stopDistanceR: state.stopDistanceR,
        alertDelivery: { status: 'PENDING', attempts: 0 },
      },
    });
  }
}

function calculateState(trade: Trade, price: string, monitoredAt: Date): TradeMonitorState {
  return {
    ...calculateTradePnl(price, trade.actualEntry, trade.quantity),
    currentR: calculateRMultiple(price, trade.actualEntry, trade.initialStop),
    ...calculateExcursion(
      price,
      trade.actualEntry,
      trade.initialStop,
      trade.maxFavorablePrice,
      trade.maxAdversePrice,
    ),
    ...calculateTradeDistances(
      price,
      trade.currentStop,
      trade.actualEntry,
      trade.initialStop,
      trade.target1,
      trade.target2,
    ),
    holdingDurationSeconds: Math.max(
      0,
      Math.floor((monitoredAt.getTime() - trade.entryDecisionAt.getTime()) / 1000),
    ),
  };
}

function applyMonitoringState(
  trade: Trade,
  price: TradePriceSnapshot,
  state: TradeMonitorState,
  monitoredAt: Date,
): void {
  trade.currentPrice = price.price;
  trade.unrealizedPnl = state.unrealizedPnl;
  trade.unrealizedPnlPercent = state.unrealizedPnlPercent;
  trade.currentR = state.currentR;
  trade.maxFavorablePrice = state.maxFavorablePrice;
  trade.maxFavorableR = state.maxFavorableR;
  trade.maxAdversePrice = state.maxAdversePrice;
  trade.maxAdverseR = state.maxAdverseR;
  trade.lastPriceObservedAt = new Date(price.observedAt);
  trade.lastMonitoredAt = monitoredAt;
  trade.monitoringVersion = TRADE_MONITOR_VERSION;
}

function toResult(
  trade: Trade,
  price: TradePriceSnapshot,
  previousPrice: string | null,
  state: TradeMonitorState,
  alerts: TradeMonitorResult['alerts'],
  monitoredAt: Date,
): TradeMonitorResult {
  return {
    monitorVersion: TRADE_MONITOR_VERSION,
    tradeId: trade.id,
    symbol: trade.symbol,
    provider: price.provider,
    providerObservedAt: price.observedAt,
    price: price.price,
    previousPrice,
    quantity: trade.quantity,
    actualEntry: trade.actualEntry,
    initialStop: trade.initialStop,
    currentStop: trade.currentStop,
    target1: trade.target1,
    target2: trade.target2,
    ...state,
    alerts,
    monitoredAt: monitoredAt.toISOString(),
  };
}

function errorCode(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (isRecord(response) && typeof response.code === 'string') return response.code;
  }
  return error instanceof Error ? error.name : 'UNKNOWN_ERROR';
}

function errorMessage(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (isRecord(response) && typeof response.message === 'string') return response.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
