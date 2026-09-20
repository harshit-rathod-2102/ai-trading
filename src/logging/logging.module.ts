import { randomUUID } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from '../config/config.module';
import { LOG_REDACTION_CENSOR, LOG_REDACTION_PATHS, REQUEST_ID_HEADER } from './logging.constants';
import { RequestLoggingInterceptor } from './request-logging.interceptor';
import { ApplicationLifecycleService } from './application-lifecycle.service';

@Global()
@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: pinoLevel(config.getOrThrow<string>('app.logLevel')),
          messageKey: 'message',
          timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
          base: { service: 'ai-trading-backend' },
          formatters: {
            level: (label: string) => ({ level: label }),
          },
          redact: {
            paths: [...LOG_REDACTION_PATHS],
            censor: LOG_REDACTION_CENSOR,
          },
          transport: config.getOrThrow<boolean>('app.logPretty')
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                  translateTime: 'SYS:standard',
                  ignore: 'pid,hostname',
                },
              }
            : undefined,
          autoLogging: true,
          quietReqLogger: true,
          customAttributeKeys: { reqId: 'requestId', responseTime: 'durationMs' },
          customLogLevel: (_request: IncomingMessage, response: ServerResponse, error?: Error) => {
            if (response.statusCode >= 500 || error) return 'error';
            if (response.statusCode >= 400) return 'warn';
            return 'info';
          },
          customSuccessMessage: (_request: IncomingMessage, response: ServerResponse) =>
            response.statusCode >= 400 ? 'HTTP request rejected' : 'HTTP request completed',
          customErrorMessage: () => 'HTTP request failed',
          customSuccessObject: (
            request: IncomingMessage,
            response: ServerResponse,
            value: { responseTime?: number; durationMs?: number },
          ) => ({
            event: response.statusCode >= 400 ? 'http.request.failed' : 'http.request.completed',
            correlationId: requestId(request),
            module: 'http',
            method: request.method,
            path: requestPath(request),
            statusCode: response.statusCode,
            durationMs: value.responseTime ?? value.durationMs,
            status: response.statusCode >= 400 ? 'failed' : 'completed',
          }),
          customErrorObject: (
            request: IncomingMessage,
            response: ServerResponse,
            error: Error,
            value: { responseTime?: number; durationMs?: number },
          ) => ({
            event: 'http.request.failed',
            correlationId: requestId(request),
            module: 'http',
            method: request.method,
            path: requestPath(request),
            statusCode: response.statusCode,
            durationMs: value.responseTime ?? value.durationMs,
            status: 'failed',
            errorName: error.name,
            errorMessage: error.message,
            stack: error.stack,
          }),
          genReqId: (request: IncomingMessage, response: ServerResponse) => {
            const supplied = request.headers[REQUEST_ID_HEADER];
            const requestId =
              typeof supplied === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)
                ? supplied
                : randomUUID();
            response.setHeader('X-Request-Id', requestId);
            return requestId;
          },
          serializers: {
            req: (request: IncomingMessage) => ({
              id: requestId(request),
              method: request.method,
              path: request.url?.split('?')[0],
            }),
            res: (response: ServerResponse) => ({ statusCode: response.statusCode }),
          },
        },
        assignResponse: true,
      }),
    }),
  ],
  providers: [
    ApplicationLifecycleService,
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}

function pinoLevel(level: string): string {
  if (level === 'log') return 'info';
  if (level === 'verbose') return 'trace';
  return level;
}

function requestId(request: IncomingMessage): string | undefined {
  const value = (request as IncomingMessage & { id?: string | number }).id;
  return value === undefined ? undefined : String(value);
}

function requestPath(request: IncomingMessage): string {
  const originalUrl = (request as IncomingMessage & { originalUrl?: string }).originalUrl;
  return (originalUrl ?? request.url ?? '').split('?')[0];
}
