import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Exchange } from '../common/enums/exchange.enum';
import { InstrumentType } from '../common/enums/instrument-type.enum';
import { TradeStatus } from '../common/enums/trade-status.enum';
import { InstrumentsService } from '../instruments/instruments.service';
import { Trade } from '../trades/entities/trade.entity';
import { OpenTradeRiskView } from './models/risk-plan-input.model';

@Injectable()
export class PortfolioRiskReaderService {
  constructor(
    @InjectRepository(Trade) private readonly trades: Repository<Trade>,
    private readonly instruments: InstrumentsService,
  ) {}

  async loadOpenTrades(): Promise<OpenTradeRiskView[]> {
    const [trades, instruments] = await Promise.all([
      this.trades.find({ where: { status: In([TradeStatus.OPEN, TradeStatus.PARTIALLY_CLOSED]) },
        order: { createdAt: 'ASC', id: 'ASC' } }),
      this.instruments.list({ exchange: Exchange.NSE, type: InstrumentType.EQUITY }),
    ]);
    const sectors = new Map(instruments.map(instrument => [instrument.symbol, instrument.sector]));
    return trades.map(trade => ({
      tradeId: trade.id, symbol: trade.symbol, sector: sectors.get(trade.symbol) ?? null,
      quantity: trade.quantity, actualEntry: trade.actualEntry, currentPrice: trade.currentPrice,
      currentStop: trade.currentStop, currentPositionValue: null,
      isPartiallyClosed: trade.status === TradeStatus.PARTIALLY_CLOSED,
    }));
  }
}
