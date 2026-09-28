import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { TradeCandidate } from '../candidates/entities/trade-candidate.entity';
import { TradeEventType } from '../common/enums/trade-event-type.enum';
import { TradeStatus } from '../common/enums/trade-status.enum';
import { marketDateUtcBounds } from '../common/utils/market-time';
import { TradeEvent } from '../journal/entities/trade-event.entity';
import { ScanResultRecord } from '../scanner/entities/scan-result.entity';
import { Trade } from '../trades/entities/trade.entity';
import { AnalyticsRangeDto } from './dto/analytics-range.dto';

export interface ResolvedAnalyticsRange {
  readonly from: string | null;
  readonly to: string | null;
  readonly start: Date | null;
  readonly endExclusive: Date | null;
}

export interface AnalyticsQueryResult {
  readonly range: ResolvedAnalyticsRange;
  readonly closedTrades: readonly Trade[];
  readonly tradeEvents: readonly TradeEvent[];
  readonly candidates: readonly TradeCandidate[];
  readonly decisionEvents: readonly TradeEvent[];
  readonly scanResults: readonly ScanResultRecord[];
}

const DECISION_EVENT_TYPES = [
  TradeEventType.CANDIDATE_QUALIFIED,
  TradeEventType.CANDIDATE_NOTIFIED,
  TradeEventType.CANDIDATE_SKIPPED,
  TradeEventType.TRADE_OPENED,
] as const;

@Injectable()
export class AnalyticsQueryService {
  constructor(
    @InjectRepository(Trade) private readonly trades: Repository<Trade>,
    @InjectRepository(TradeEvent) private readonly events: Repository<TradeEvent>,
    @InjectRepository(TradeCandidate)
    private readonly candidates: Repository<TradeCandidate>,
    @InjectRepository(ScanResultRecord)
    private readonly scanResults: Repository<ScanResultRecord>,
  ) {}

  async load(input: AnalyticsRangeDto): Promise<AnalyticsQueryResult> {
    const range = resolveAnalyticsRange(input);
    const closedTrades = await this.loadClosedTrades(range);
    const tradeIds = closedTrades.map((trade) => trade.id);
    const [tradeEvents, candidates, decisionEvents, scanResults] = await Promise.all([
      this.loadTradeEvents(tradeIds),
      this.loadCandidates(range),
      this.loadDecisionEvents(range),
      this.loadScanResults(range),
    ]);
    return { range, closedTrades, tradeEvents, candidates, decisionEvents, scanResults };
  }

  private loadClosedTrades(range: ResolvedAnalyticsRange): Promise<Trade[]> {
    const query = this.trades
      .createQueryBuilder('trade')
      .leftJoinAndSelect('trade.candidate', 'candidate')
      .where('trade.status IN (:...statuses)', {
        statuses: [TradeStatus.CLOSED, TradeStatus.STOPPED_OUT],
      })
      .andWhere('trade.closed_at IS NOT NULL');
    applyRange(query, 'trade.closed_at', range);
    return query.orderBy('trade.closed_at', 'ASC').addOrderBy('trade.id', 'ASC').getMany();
  }

  private loadTradeEvents(tradeIds: readonly string[]): Promise<TradeEvent[]> {
    if (!tradeIds.length) return Promise.resolve([]);
    return this.events
      .createQueryBuilder('event')
      .where('event.trade_id IN (:...tradeIds)', { tradeIds })
      .andWhere('event.event_type IN (:...eventTypes)', {
        eventTypes: [TradeEventType.TRADE_OPENED, TradeEventType.TRADE_CLOSED],
      })
      .orderBy('event.created_at', 'ASC')
      .addOrderBy('event.id', 'ASC')
      .getMany();
  }

  private loadCandidates(range: ResolvedAnalyticsRange): Promise<TradeCandidate[]> {
    const query = this.candidates.createQueryBuilder('candidate');
    applyRange(query, 'candidate.detected_at', range);
    return query
      .orderBy('candidate.detected_at', 'ASC')
      .addOrderBy('candidate.id', 'ASC')
      .getMany();
  }

  private loadDecisionEvents(range: ResolvedAnalyticsRange): Promise<TradeEvent[]> {
    const query = this.events
      .createQueryBuilder('event')
      .where('event.event_type IN (:...eventTypes)', { eventTypes: DECISION_EVENT_TYPES });
    applyRange(query, 'event.created_at', range);
    return query.orderBy('event.created_at', 'ASC').addOrderBy('event.id', 'ASC').getMany();
  }

  private loadScanResults(range: ResolvedAnalyticsRange): Promise<ScanResultRecord[]> {
    const query = this.scanResults.createQueryBuilder('result');
    applyRange(query, 'result.created_at', range);
    return query.orderBy('result.created_at', 'ASC').addOrderBy('result.id', 'ASC').getMany();
  }
}

export function resolveAnalyticsRange(input: AnalyticsRangeDto): ResolvedAnalyticsRange {
  if (input.from && !isRealDate(input.from)) invalidRange('from must be a real YYYY-MM-DD date');
  if (input.to && !isRealDate(input.to)) invalidRange('to must be a real YYYY-MM-DD date');
  if (input.from && input.to && input.from > input.to) {
    invalidRange('from must be before or equal to to');
  }
  return {
    from: input.from ?? null,
    to: input.to ?? null,
    start: input.from ? marketDateUtcBounds(input.from).start : null,
    endExclusive: input.to ? marketDateUtcBounds(input.to).end : null,
  };
}

function applyRange<Entity extends ObjectLiteral>(
  query: SelectQueryBuilder<Entity>,
  column: string,
  range: ResolvedAnalyticsRange,
): void {
  if (range.start) query.andWhere(`${column} >= :analyticsStart`, { analyticsStart: range.start });
  if (range.endExclusive) {
    query.andWhere(`${column} < :analyticsEnd`, { analyticsEnd: range.endExclusive });
  }
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function invalidRange(message: string): never {
  throw new BadRequestException({ code: 'ANALYTICS_DATE_RANGE_INVALID', message });
}
