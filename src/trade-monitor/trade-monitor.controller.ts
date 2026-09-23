import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { TradeMonitorService } from './trade-monitor.service';

@ApiTags('Trade Monitor')
@Controller('trade-monitor')
export class TradeMonitorController {
  constructor(private readonly monitor: TradeMonitorService) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Monitor every open tracked trade without placing orders' })
  run() {
    return this.monitor.monitorOpenTrades();
  }

  @Post('trades/:tradeId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Monitor one open tracked trade without placing orders' })
  @ApiParam({ name: 'tradeId', format: 'uuid' })
  monitorTrade(@Param('tradeId', ParseUUIDPipe) tradeId: string) {
    return this.monitor.monitorTrade(tradeId);
  }
}
