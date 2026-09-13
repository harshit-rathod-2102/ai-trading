import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { TradeCandidate } from './entities/trade-candidate.entity';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { ListCandidatesDto } from './dto/list-candidates.dto';
import { CandidateStatus } from '../common/enums/candidate-status.enum';
import { EventSource } from '../common/enums/event-source.enum';
import { TradeEventType } from '../common/enums/trade-event-type.enum';
import { initialRisk } from '../common/utils/price';
import { TradesService, OpenTradeCommand } from '../trades/trades.service';
import { Trade } from '../trades/entities/trade.entity';
import { JournalService } from '../journal/journal.service';

@Injectable()
export class CandidatesService {
  private readonly logger = new Logger(CandidatesService.name);

  constructor(
    @InjectRepository(TradeCandidate) private readonly candidates: Repository<TradeCandidate>,
    private readonly dataSource: DataSource,
    private readonly trades: TradesService,
    private readonly journal: JournalService,
  ) {}

  async create(input: CreateCandidateDto, source: EventSource = EventSource.SYSTEM): Promise<TradeCandidate> {
    initialRisk(input.proposedEntry, input.proposedStop, input.suggestedQuantity);
    const candidate = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(TradeCandidate);
      const created = await repository.save(repository.create({
        id: randomUUID(),
        symbol: input.symbol,
        exchange: input.exchange,
        strategy: input.strategy,
        strategyVersion: input.strategyVersion,
        proposedEntry: input.proposedEntry,
        proposedStop: input.proposedStop,
        target1: input.target1 ?? null,
        target2: input.target2 ?? null,
        suggestedQuantity: input.suggestedQuantity,
        quantScore: String(input.quantScore),
        technicalSnapshot: input.technicalSnapshot,
        riskSnapshot: input.riskSnapshot,
        aiAnalysis: null,
        status: CandidateStatus.NEW,
        detectedAt: new Date(),
      }));
      await this.journal.record(manager, {
        candidateId: created.id, eventType: TradeEventType.CANDIDATE_CREATED, source,
        data: { status: CandidateStatus.NEW },
      });
      return created;
    });
    this.logger.log(`Candidate created: ${candidate.id} (${candidate.symbol})`);
    return candidate;
  }

  list(filters: ListCandidatesDto): Promise<TradeCandidate[]> {
    return this.candidates.find({
      where: { status: filters.status, symbol: filters.symbol },
      order: { createdAt: 'DESC', id: 'ASC' },
    });
  }

  async get(id: string): Promise<TradeCandidate> {
    const candidate = await this.candidates.findOneBy({ id });
    if (!candidate) throw new NotFoundException('Candidate not found');
    return candidate;
  }

  private async lockUndecided(manager: EntityManager, id: string): Promise<TradeCandidate> {
    const candidate = await manager.getRepository(TradeCandidate).findOne({
      where: { id }, lock: { mode: 'pessimistic_write' },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    if (candidate.status !== CandidateStatus.NEW) {
      throw new ConflictException(`Candidate in ${candidate.status} cannot be bought or skipped`);
    }
    return candidate;
  }

  async skip(id: string, reason?: string, source: EventSource = EventSource.SYSTEM): Promise<TradeCandidate> {
    const candidate = await this.dataSource.transaction(async (manager) => {
      const locked = await this.lockUndecided(manager, id);
      locked.status = CandidateStatus.SKIPPED;
      const saved = await manager.getRepository(TradeCandidate).save(locked);
      await this.journal.record(manager, {
        candidateId: id, eventType: TradeEventType.CANDIDATE_SKIPPED, source,
        data: { previousStatus: CandidateStatus.NEW, status: CandidateStatus.SKIPPED, reason: reason ?? null },
      });
      return saved;
    });
    this.logger.log(`Candidate skipped: ${id}`);
    return candidate;
  }

  async buy(id: string, command: OpenTradeCommand, source: EventSource = EventSource.SYSTEM): Promise<Trade> {
    const trade = await this.dataSource.transaction(async (manager) => {
      const candidate = await this.lockUndecided(manager, id);
      if (await manager.getRepository(Trade).existsBy({ candidateId: id })) {
        throw new ConflictException('Candidate already has a trade');
      }
      const opened = await this.trades.openFromCandidate(manager, candidate, command);
      candidate.status = CandidateStatus.ACCEPTED;
      await manager.getRepository(TradeCandidate).save(candidate);
      await this.journal.record(manager, {
        candidateId: id, tradeId: opened.id, eventType: TradeEventType.TRADE_OPENED, source,
        price: opened.actualEntry, quantity: opened.quantity,
        data: {
          previousStatus: CandidateStatus.NEW, status: CandidateStatus.ACCEPTED,
          plannedEntry: opened.plannedEntry, initialStop: opened.initialStop,
          initialRiskAmount: opened.initialRiskAmount,
        },
      });
      return opened;
    });
    this.logger.log(`Candidate accepted: ${id}`);
    this.logger.log(`Trade opened: ${trade.id} for candidate ${id}`);
    return trade;
  }

  async events(id: string) {
    await this.get(id);
    return this.journal.forCandidate(id);
  }
}
