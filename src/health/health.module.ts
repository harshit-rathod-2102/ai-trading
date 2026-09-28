import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis-health.indicator';
import { UpstoxAuthModule } from '../providers/upstox/auth/upstox-auth.module';

@Module({
  imports: [TerminusModule, UpstoxAuthModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
