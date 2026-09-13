import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

export const SYSTEM_QUEUE = 'system';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.getOrThrow<string>('redis.host'),
          port: configService.getOrThrow<number>('redis.port'),
        },
      }),
    }),
    BullModule.registerQueue({ name: SYSTEM_QUEUE }),
  ],
  exports: [BullModule],
})
export class JobsModule {}
