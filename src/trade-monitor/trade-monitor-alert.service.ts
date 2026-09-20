import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { TradeEventType } from '../common/enums/trade-event-type.enum';
import { TradeEvent } from '../journal/entities/trade-event.entity';
import { elapsedMilliseconds, structuredError } from '../logging/logging.utils';
import { MessagingService } from '../messaging/messaging.service';
import { MessageDeliveryStatus, MessageType } from '../providers/messaging/models/message.enums';
import { Trade } from '../trades/entities/trade.entity';
import { tradeMonitorV1Config } from './config/trade-monitor-v1.config';
import {
  TradeAlertDeliveryStatus,
  TradeAlertSeverity,
  TradeAlertType,
} from './models/trade-alert-type.enum';
import { TradeMonitorAlert } from './models/trade-monitor-result.model';

const ALERT_EVENT_TYPES = [
  TradeEventType.PRICE_MILESTONE_REACHED,
  TradeEventType.ADVERSE_MOVE_OBSERVED,
  TradeEventType.STOP_PROXIMITY_OBSERVED,
  TradeEventType.STOP_BREACHED_OBSERVED,
  TradeEventType.TARGET1_REACHED,
  TradeEventType.TARGET2_REACHED,
] as const;

interface ClaimedAlert {
  readonly eventId: string;
  readonly type: TradeAlertType;
  readonly severity: TradeAlertSeverity;
  readonly attempts: number;
  readonly data: Record<string, unknown>;
}

@Injectable()
export class TradeMonitorAlertService {
  private readonly logger = new Logger(TradeMonitorAlertService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TradeEvent) private readonly events: Repository<TradeEvent>,
    private readonly messaging: MessagingService,
    private readonly config: ConfigService,
  ) {}

  async deliverPendingForTrade(
    trade: Trade,
    newEventIds: ReadonlySet<string>,
  ): Promise<readonly TradeMonitorAlert[]> {
    const events = await this.events.find({
      where: { tradeId: trade.id, eventType: In([...ALERT_EVENT_TYPES]) },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const results: TradeMonitorAlert[] = [];
    for (const event of events) {
      const claimed = await this.claim(event.id);
      if (!claimed) continue;
      const isNew = newEventIds.has(event.id);
      if (isNew) {
        this.logger.log({ event: 'trade_monitor.alert.generated', module: TradeMonitorAlertService.name,
          operation: 'deliverPendingForTrade', tradeId: trade.id, symbol: trade.symbol,
          alertType: claimed.type, currentPrice: claimed.data.price,
          currentR: claimed.data.currentR,
          provider: this.config.get<string>('providers.messaging') },
        'Trade-monitor alert generated');
      }
      results.push(await this.send(trade, claimed, isNew));
    }
    return results;
  }

  private async claim(eventId: string): Promise<ClaimedAlert | null> {
    return this.dataSource.transaction(async manager => {
      const repository = manager.getRepository(TradeEvent);
      const event = await repository.findOne({
        where: { id: eventId }, lock: { mode: 'pessimistic_write' },
      });
      if (!event || !isRecord(event.data)) return null;
      const type = alertType(event.data.alertType);
      const severity = alertSeverity(event.data.severity);
      if (!type || !severity) return null;
      const previous = isRecord(event.data.alertDelivery) ? event.data.alertDelivery : {};
      if (previous.status === 'SENT') return null;
      if (previous.status === 'SENDING' && typeof previous.lastAttemptAt === 'string') {
        const claimedAt = Date.parse(previous.lastAttemptAt);
        if (Number.isFinite(claimedAt) && Date.now() - claimedAt < tradeMonitorV1Config.alertClaimTtlMs) {
          return null;
        }
      }
      const attempts = integerValue(previous.attempts) + 1;
      const lastAttemptAt = new Date().toISOString();
      event.data = {
        ...event.data,
        alertDelivery: { status: 'SENDING', attempts, lastAttemptAt },
      };
      await repository.save(event);
      return { eventId, type, severity, attempts, data: event.data };
    });
  }

  private async send(
    trade: Trade,
    alert: ClaimedAlert,
    isNew: boolean,
  ): Promise<TradeMonitorAlert> {
    const startedAt = performance.now();
    try {
      const recipient = this.config.get<string>('metaWhatsapp.allowedSender')?.trim();
      if (!recipient) throw new ServiceUnavailableException('Alert recipient is not configured');
      const delivery = await this.messaging.sendMessage({
        recipient,
        messageType: MessageType.TEXT,
        text: buildAlertMessage(trade, alert),
        metadata: { tradeId: trade.id, alertType: alert.type, eventId: alert.eventId },
      });
      if (delivery.status === MessageDeliveryStatus.FAILED) {
        throw new ServiceUnavailableException('Messaging provider reported failed delivery');
      }
      await this.finish(alert.eventId, {
        status: 'SENT', attempts: alert.attempts, lastAttemptAt: new Date().toISOString(),
        providerMessageId: delivery.providerMessageId,
        providerStatus: delivery.status,
        providerSentAt: delivery.sentAt,
      });
      this.logger.log({ event: 'trade_monitor.alert.sent', module: TradeMonitorAlertService.name,
        operation: 'send', tradeId: trade.id, symbol: trade.symbol, alertType: alert.type,
        provider: this.config.get<string>('providers.messaging'),
        providerMessageId: delivery.providerMessageId,
        durationMs: elapsedMilliseconds(startedAt) }, 'Trade-monitor alert sent');
      return {
        eventId: alert.eventId, type: alert.type, severity: alert.severity, isNew,
        deliveryStatus: TradeAlertDeliveryStatus.SENT,
        providerMessageId: delivery.providerMessageId,
      };
    } catch (error: unknown) {
      await this.finish(alert.eventId, {
        status: 'FAILED', attempts: alert.attempts, lastAttemptAt: new Date().toISOString(),
        error: error instanceof Error ? error.name : 'UnknownError',
      });
      this.logger.error({ event: 'trade_monitor.alert.failed', module: TradeMonitorAlertService.name,
        operation: 'send', tradeId: trade.id, symbol: trade.symbol, alertType: alert.type,
        provider: this.config.get<string>('providers.messaging'),
        durationMs: elapsedMilliseconds(startedAt), ...structuredError(error) },
      'Trade-monitor alert delivery failed');
      return {
        eventId: alert.eventId, type: alert.type, severity: alert.severity, isNew,
        deliveryStatus: TradeAlertDeliveryStatus.FAILED,
        providerMessageId: null,
      };
    }
  }

  private async finish(eventId: string, delivery: Record<string, unknown>): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const repository = manager.getRepository(TradeEvent);
      const event = await repository.findOne({
        where: { id: eventId }, lock: { mode: 'pessimistic_write' },
      });
      if (!event || !isRecord(event.data)) return;
      event.data = { ...event.data, alertDelivery: delivery };
      await repository.save(event);
    });
  }
}

function buildAlertMessage(trade: Trade, alert: ClaimedAlert): string {
  const price = textValue(alert.data.price) ?? trade.currentPrice ?? 'N/A';
  const currentR = signedR(textValue(alert.data.currentR));
  const pnl = textValue(alert.data.unrealizedPnl) ?? trade.unrealizedPnl ?? 'N/A';
  const heading = {
    [TradeAlertType.PLUS_1R]: `📈 ${trade.symbol} reached +1R`,
    [TradeAlertType.PLUS_2R]: `📈 ${trade.symbol} reached +2R`,
    [TradeAlertType.ADVERSE_MOVE]: `⚠️ ${trade.symbol} adverse move`,
    [TradeAlertType.STOP_PROXIMITY]: `⚠️ ${trade.symbol} near tracked stop`,
    [TradeAlertType.STOP_BREACHED]: `🚨 ${trade.symbol} crossed tracked stop`,
    [TradeAlertType.TARGET1_REACHED]: `🎯 ${trade.symbol} reached target 1`,
    [TradeAlertType.TARGET2_REACHED]: `🎯 ${trade.symbol} reached target 2`,
  }[alert.type];
  return [
    heading,
    '',
    `Entry: ₹${trade.actualEntry}`,
    `Current: ₹${price}`,
    `Tracked stop: ₹${trade.currentStop}`,
    `Current R: ${currentR}`,
    `Unrealized P&L: ₹${pnl}`,
    '',
    alert.type === TradeAlertType.STOP_BREACHED
      ? 'Review the position at your broker.'
      : 'Trade remains open in this application.',
    'No broker order or stop change was made by this app.',
  ].join('\n');
}

function alertType(value: unknown): TradeAlertType | null {
  return typeof value === 'string' && Object.values(TradeAlertType).includes(value as TradeAlertType)
    ? value as TradeAlertType : null;
}

function alertSeverity(value: unknown): TradeAlertSeverity | null {
  return typeof value === 'string' && Object.values(TradeAlertSeverity).includes(value as TradeAlertSeverity)
    ? value as TradeAlertSeverity : null;
}

function signedR(value: string | undefined): string {
  if (!value) return 'N/A';
  return `${Number(value) > 0 ? '+' : ''}${value}R`;
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function integerValue(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
