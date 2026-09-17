import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { structuredError } from '../logging/logging.utils';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(configService: ConfigService) {
    this.client = new Redis({
      host: configService.getOrThrow<string>('redis.host'),
      port: configService.getOrThrow<number>('redis.port'),
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });

    this.client.on('error', (error: Error) => {
      this.logger.error({ event: 'redis.connection.failed', module: RedisService.name,
        operation: 'connection', ...structuredError(error) }, 'Redis connection failed');
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.logger.log({ event: 'redis.ready', module: RedisService.name,
      operation: 'connect', status: 'ready' }, 'Redis is ready');
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  getClient(): Redis {
    return this.client;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status !== 'end') {
      this.logger.log({ event: 'redis.connection.closing', module: RedisService.name,
        operation: 'shutdown', status: 'closing' }, 'Redis connection closing');
      await this.client.quit();
    }
  }
}
