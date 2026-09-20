import { Injectable } from '@nestjs/common';
import { Exchange } from '../../common/enums/exchange.enum';
import { MarketDataService } from '../../market-data/market-data.service';

@Injectable()
export class TradingDayService {
  private readonly cache = new Map<string, Promise<boolean>>();

  constructor(private readonly marketData: MarketDataService) {}

  isWeekend(marketDate: string): boolean {
    const day = new Date(`${marketDate}T00:00:00.000Z`).getUTCDay();
    return day === 0 || day === 6;
  }

  async isTradingDay(marketDate: string): Promise<boolean> {
    if (this.isWeekend(marketDate)) return false;
    const existing = this.cache.get(marketDate);
    if (existing) return existing;
    const check = this.marketData
      .tradingCalendar(Exchange.NSE, marketDate, marketDate)
      .then((calendar) => calendar.sessions.some((session) => session.date === marketDate))
      .catch((error) => {
        this.cache.delete(marketDate);
        throw error;
      });
    this.cache.set(marketDate, check);
    return check;
  }
}
