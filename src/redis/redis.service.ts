import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

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
      this.logger.error(`Redis connection error: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  getClient(): Redis {
    return this.client;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit();
    }
  }
}
