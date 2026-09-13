import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { TradeEvent } from './entities/trade-event.entity';
import { EventSource } from '../common/enums/event-source.enum';
import { TradeEventType } from '../common/enums/trade-event-type.enum';

export interface RecordEvent {
  candidateId?: string;
  tradeId?: string;
  eventType: TradeEventType;
  source: EventSource;
  price?: string;
  quantity?: number;
  data?: Record<string, unknown>;
}

@Injectable()
export class JournalService {
  constructor(@InjectRepository(TradeEvent) private readonly events: Repository<TradeEvent>) {}

  // Require the caller's transaction so events cannot commit independently of state.
  record(manager: EntityManager, input: RecordEvent): Promise<TradeEvent> {
    const repository = manager.getRepository(TradeEvent);
    return repository.save(repository.create({
      id: randomUUID(),
      ...input,
      tradeId: input.tradeId ?? null,
      candidateId: input.candidateId ?? null,
      price: input.price ?? null,
      quantity: input.quantity ?? null,
      data: input.data ?? null,
    }));
  }

  forCandidate(candidateId: string): Promise<TradeEvent[]> {
    return this.events.find({ where: { candidateId }, order: { createdAt: 'ASC', id: 'ASC' } });
  }

  forTrade(tradeId: string, candidateId: string): Promise<TradeEvent[]> {
    // Include the candidate history that preceded the explicit BUY decision.
    return this.events.find({
      where: [{ tradeId }, { candidateId, tradeId: IsNull() }],
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }
}
