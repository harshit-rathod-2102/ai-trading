import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TradingProfileService } from './trading-profile.service';
import { UpsertTradingProfileDto } from './dto/upsert-trading-profile.dto';

@ApiTags('Trading Profile')
@Controller('settings/trading-profile')
export class TradingProfileController {
  constructor(private readonly profiles: TradingProfileService) {}

  @Get()
  getActiveProfile() {
    return this.profiles.getActiveProfile();
  }

  @Put()
  upsertActiveProfile(@Body() input: UpsertTradingProfileDto) {
    return this.profiles.upsertActiveProfile(input);
  }
}
