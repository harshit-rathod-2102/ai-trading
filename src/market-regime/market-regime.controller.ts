import { Controller, Get } from '@nestjs/common';
import { MarketRegimeService } from './market-regime.service';

@Controller('market-regime')
export class MarketRegimeController {
  constructor(private readonly marketRegime: MarketRegimeService) {}

  @Get()
  current() {
    return this.marketRegime.calculateCurrentRegime();
  }
}
