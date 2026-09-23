import { ConfigService } from '@nestjs/config';

export const UPSTOX_CONFIG = Symbol('UPSTOX_CONFIG');

export interface UpstoxConfig {
  readonly clientId: string | null;
  readonly clientSecret: string | null;
  readonly accessToken: string | null;
  readonly apiBaseUrl: string;
  readonly instrumentFileUrl: string;
  readonly httpTimeoutMs: number;
  readonly maxRetries: number;
  readonly retryBaseDelayMs: number;
}

export function createUpstoxConfig(config: ConfigService): UpstoxConfig {
  return {
    clientId: config.get<string>('upstox.clientId') || null,
    clientSecret: config.get<string>('upstox.clientSecret') || null,
    accessToken: config.get<string>('upstox.accessToken') || null,
    apiBaseUrl: config.getOrThrow<string>('upstox.apiBaseUrl').replace(/\/$/, ''),
    instrumentFileUrl: config.getOrThrow<string>('upstox.instrumentFileUrl'),
    httpTimeoutMs: config.getOrThrow<number>('upstox.httpTimeoutMs'),
    maxRetries: config.getOrThrow<number>('upstox.maxRetries'),
    retryBaseDelayMs: config.getOrThrow<number>('upstox.retryBaseDelayMs'),
  };
}
