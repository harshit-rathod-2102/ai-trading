import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { BuyCandidateDto } from './dto/buy-candidate.dto';
import { SkipCandidateDto } from './dto/skip-candidate.dto';
import { ListCandidatesDto } from './dto/list-candidates.dto';
import { EventSource } from '../common/enums/event-source.enum';

@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Post()
  create(@Body() input: CreateCandidateDto) {
    return this.candidates.create(input, EventSource.REST);
  }

  @Get()
  list(@Query() filters: ListCandidatesDto) { return this.candidates.list(filters); }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.candidates.get(id); }

  @Post(':id/buy')
  buy(@Param('id', ParseUUIDPipe) id: string, @Body() input: BuyCandidateDto) {
    return this.candidates.buy(id, input, EventSource.REST);
  }

  @Post(':id/skip')
  skip(@Param('id', ParseUUIDPipe) id: string, @Body() input: SkipCandidateDto) {
    return this.candidates.skip(id, input?.reason, EventSource.REST);
  }

  @Get(':id/events')
  events(@Param('id', ParseUUIDPipe) id: string) { return this.candidates.events(id); }
}
