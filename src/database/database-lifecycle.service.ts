import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseLifecycleService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseLifecycleService.name);

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    this.logger.log(
      {
        event: 'database.ready',
        module: DatabaseLifecycleService.name,
        operation: 'connect',
        status: this.dataSource.isInitialized ? 'ready' : 'unavailable',
      },
      'PostgreSQL connection is ready',
    );
  }

  onApplicationShutdown(): void {
    this.logger.log(
      {
        event: 'database.connection.closing',
        module: DatabaseLifecycleService.name,
        operation: 'shutdown',
        status: 'closing',
      },
      'PostgreSQL connection closing',
    );
  }
}
