import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradingProfile } from './entities/trading-profile.entity';
import { TradingProfileController } from './trading-profile.controller';
import { TradingProfileService } from './trading-profile.service';

@Module({
  imports: [TypeOrmModule.forFeature([TradingProfile])],
  controllers: [TradingProfileController],
  providers: [TradingProfileService],
  exports: [TradingProfileService],
})
export class TradingProfileModule {}
