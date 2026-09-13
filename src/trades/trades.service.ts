import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Trade } from './entities/trade.entity';
import { TradeCandidate } from '../candidates/entities/trade-candidate.entity';
import { TradeStatus } from '../common/enums/trade-status.enum';
import { initialRisk } from '../common/utils/price';
import { JournalService } from '../journal/journal.service';
import { ListTradesDto } from './dto/list-trades.dto';

export interface OpenTradeCommand {
  actualEntry: string;
  quantity: number;
}

@Injectable()
export class TradesService {
  constructor(
    @InjectRepository(Trade) private readonly trades: Repository<Trade>,
    private readonly journal: JournalService,
  ) {}

  // Called only by candidate acceptance, within its locked transaction.
  openFromCandidate(manager: EntityManager, candidate: TradeCandidate, command: OpenTradeCommand): Promise<Trade> {
    const repository = manager.getRepository(Trade);
    return repository.save(repository.create({
      id: randomUUID(),
      candidateId: candidate.id,
      symbol: candidate.symbol,
      strategy: candidate.strategy,
      strategyVersion: candidate.strategyVersion,
      status: TradeStatus.OPEN,
      entryDecisionAt: new Date(),
      plannedEntry: candidate.proposedEntry,
      actualEntry: command.actualEntry,
      quantity: command.quantity,
      initialStop: candidate.proposedStop,
      currentStop: candidate.proposedStop,
      target1: candidate.target1,
      target2: candidate.target2,
      initialRiskAmount: initialRisk(command.actualEntry, candidate.proposedStop, command.quantity),
      currentPrice: null,
      realizedPnl: '0.0000',
      closedAt: null,
    }));
  }

  list(filters: ListTradesDto): Promise<Trade[]> {
    return this.trades.find({
      where: { status: filters.status, symbol: filters.symbol },
      order: { createdAt: 'DESC', id: 'ASC' },
    });
  }

  async get(id: string): Promise<Trade> {
    const trade = await this.trades.findOneBy({ id });
    if (!trade) throw new NotFoundException('Trade not found');
    return trade;
  }

  async events(id: string) {
    const trade = await this.get(id);
    return this.journal.forTrade(trade.id, trade.candidateId);
  }
}
