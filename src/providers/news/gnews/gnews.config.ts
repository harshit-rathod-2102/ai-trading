import { ConfigService } from '@nestjs/config';

export const GNEWS_CONFIG = Symbol('GNEWS_CONFIG');

export interface GNewsConfig {
  readonly apiKey: string | null;
  readonly baseUrl: string;
  readonly defaultLanguage: string;
  readonly defaultCountry: string;
  readonly maxResults: number;
  readonly httpTimeoutMs: number;
  readonly maxRetries: number;
  readonly retryBaseDelayMs: number;
  readonly cacheTtlMs: number;
}

export function createGNewsConfig(config: ConfigService): GNewsConfig {
  return {
    apiKey: config.get<string>('gnews.apiKey') || null,
    baseUrl: config.getOrThrow<string>('gnews.baseUrl').replace(/\/$/, ''),
    defaultLanguage: config.getOrThrow<string>('gnews.defaultLanguage'),
    defaultCountry: config.getOrThrow<string>('gnews.defaultCountry'),
    maxResults: config.getOrThrow<number>('gnews.maxResults'),
    httpTimeoutMs: config.getOrThrow<number>('gnews.httpTimeoutMs'),
    maxRetries: config.getOrThrow<number>('gnews.maxRetries'),
    retryBaseDelayMs: config.getOrThrow<number>('gnews.retryBaseDelayMs'),
    cacheTtlMs: config.getOrThrow<number>('gnews.cacheTtlMs'),
  };
}
