import { Body, Controller, Get, Put } from '@nestjs/common';
import { TradingProfileService } from './trading-profile.service';
import { UpsertTradingProfileDto } from './dto/upsert-trading-profile.dto';

@Controller('settings/trading-profile')
export class TradingProfileController {
  constructor(private readonly profiles: TradingProfileService) {}
  @Get()
  getActiveProfile() { return this.profiles.getActiveProfile(); }
  @Put()
  upsertActiveProfile(@Body() input: UpsertTradingProfileDto) {
    return this.profiles.upsertActiveProfile(input);
  }
}
