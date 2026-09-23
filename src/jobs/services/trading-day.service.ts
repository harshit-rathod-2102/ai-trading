import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Exchange } from '../../common/enums/exchange.enum';
import { marketClock, subtractCalendarDays } from '../../common/utils/market-time';
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

  async latestCompletedSession(now = new Date(), timezone = 'Asia/Kolkata'): Promise<string> {
    const today = marketClock(now, timezone).marketDate;
    const calendar = await this.marketData.tradingCalendar(
      Exchange.NSE,
      subtractCalendarDays(today, 31),
      today,
    );
    const completed = calendar.sessions
      .filter((session) => {
        const closeAt = Date.parse(session.closeAt);
        return Number.isFinite(closeAt) && closeAt <= now.getTime();
      })
      .sort((left, right) => left.date.localeCompare(right.date))
      .at(-1);
    if (!completed) {
      throw new ServiceUnavailableException({
        code: 'COMPLETED_TRADING_SESSION_UNAVAILABLE',
        message: 'No completed NSE trading session is available for a run-now pipeline',
      });
    }
    return completed.date;
  }
}
