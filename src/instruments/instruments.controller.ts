import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { InstrumentsService } from './instruments.service';
import {
  CreateInstrumentDto,
  ListInstrumentsDto,
  SetInstrumentActivityDto,
} from './dto/instrument.dto';

@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly instruments: InstrumentsService) {}

  @Post() create(@Body() input: CreateInstrumentDto) {
    return this.instruments.create(input);
  }

  @Get() list(@Query() query: ListInstrumentsDto) {
    return this.instruments.list(query);
  }

  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) {
    return this.instruments.get(id);
  }

  @Patch(':id/activity') activity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: SetInstrumentActivityDto,
  ) {
    return this.instruments.setActivity(id, input.isActive);
  }
}
