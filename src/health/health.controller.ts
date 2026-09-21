import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis-health.indicator';
import { ConfigService } from '@nestjs/config';
import { UpstoxTokenService } from '../providers/upstox/auth/upstox-token.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly config: ConfigService,
    private readonly upstoxTokens: UpstoxTokenService,
  ) {}

  @Get()
  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
    const auth = await this.upstoxTokens.getStatus();
    return this.health.check([
      () => this.database.pingCheck('database'),
      () => this.redis.pingCheck('redis'),
      () =>
        Promise.resolve({
          upstox: {
            status: 'up',
            enabled: this.config.getOrThrow<string>('providers.marketData') === 'upstox',
            configured: auth.configured,
            authenticated: auth.authenticated,
            source: auth.source,
          },
        }),
    ]);
  }
}
