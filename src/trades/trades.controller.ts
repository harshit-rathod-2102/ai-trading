import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { TradesService } from './trades.service';
import { ListTradesDto } from './dto/list-trades.dto';

@ApiTags('Trades')
@Controller('trades')
export class TradesController {
  constructor(private readonly trades: TradesService) {}

  @Get()
  list(@Query() filters: ListTradesDto) {
    return this.trades.list(filters);
  }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.trades.get(id);
  }

  @Get(':id/events')
  @ApiParam({ name: 'id', format: 'uuid' })
  events(@Param('id', ParseUUIDPipe) id: string) {
    return this.trades.events(id);
  }
}
