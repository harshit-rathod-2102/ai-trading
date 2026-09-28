import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class ApplicationLifecycleService implements OnApplicationShutdown {
  private readonly logger = new Logger(ApplicationLifecycleService.name);

  onApplicationShutdown(signal?: string): void {
    this.logger.log(
      {
        event: 'app.shutting_down',
        module: ApplicationLifecycleService.name,
        operation: 'shutdown',
        signal,
        status: 'shutting_down',
      },
      'Application shutting down',
    );
  }
}
