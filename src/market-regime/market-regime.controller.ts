import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MarketRegimeService } from './market-regime.service';

@ApiTags('Market Regime')
@Controller('market-regime')
export class MarketRegimeController {
  constructor(private readonly marketRegime: MarketRegimeService) {}

  @Get()
  current() {
    return this.marketRegime.calculateCurrentRegime();
  }
}
