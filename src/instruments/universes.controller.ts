import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { InstrumentsService } from './instruments.service';
import { CreateUniverseDto, UniverseCodeDto, UniverseMemberParamsDto } from './dto/instrument.dto';

@Controller('universes')
export class UniversesController {
  constructor(private readonly instruments: InstrumentsService) {}
  @Post() create(@Body() input: CreateUniverseDto) {
    return this.instruments.createUniverse(input);
  }
  @Get() list() {
    return this.instruments.listUniverses();
  }
  @Get(':code/instruments')
  async members(@Param() params: UniverseCodeDto) {
    await this.instruments.getUniverse(params.code);
    return this.instruments.list({ universe: params.code });
  }
  @Put(':code/instruments/:id')
  add(@Param() params: UniverseMemberParamsDto) {
    return this.instruments.addMember(params.code, params.id);
  }
}
