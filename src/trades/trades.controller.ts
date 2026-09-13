import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { TradesService } from './trades.service';
import { ListTradesDto } from './dto/list-trades.dto';

@Controller('trades')
export class TradesController {
  constructor(private readonly trades: TradesService) {}

  @Get()
  list(@Query() filters: ListTradesDto) { return this.trades.list(filters); }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.trades.get(id); }

  @Get(':id/events')
  events(@Param('id', ParseUUIDPipe) id: string) { return this.trades.events(id); }
}
