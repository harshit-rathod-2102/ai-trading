import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DatabaseLifecycleService } from './database-lifecycle.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => ({
        type: 'postgres',
        host: configService.getOrThrow<string>('database.host'),
        port: configService.getOrThrow<number>('database.port'),
        database: configService.getOrThrow<string>('database.name'),
        username: configService.getOrThrow<string>('database.user'),
        password: configService.getOrThrow<string>('database.password'),
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
        logging: configService.getOrThrow<boolean>('database.queryLogging')
          ? ['query', 'error', 'warn']
          : false,
      }),
    }),
  ],
  providers: [DatabaseLifecycleService],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
