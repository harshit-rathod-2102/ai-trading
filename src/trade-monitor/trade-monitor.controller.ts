import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { TradeMonitorService } from './trade-monitor.service';

@Controller('trade-monitor')
export class TradeMonitorController {
  constructor(private readonly monitor: TradeMonitorService) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  run() {
    return this.monitor.monitorOpenTrades();
  }

  @Post('trades/:tradeId')
  @HttpCode(HttpStatus.OK)
  monitorTrade(@Param('tradeId', ParseUUIDPipe) tradeId: string) {
    return this.monitor.monitorTrade(tradeId);
  }
}
