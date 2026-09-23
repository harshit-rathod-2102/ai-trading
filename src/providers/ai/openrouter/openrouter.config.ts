import { ConfigService } from '@nestjs/config';

export const OPENROUTER_CONFIG = Symbol('OPENROUTER_CONFIG');

export interface OpenRouterConfig {
  readonly apiKey: string | null;
  readonly baseUrl: string;
  readonly model: string;
  readonly fastModel: string;
  readonly deepModel: string;
  readonly httpTimeoutMs: number;
  readonly appName: string;
  readonly siteUrl: string | null;
  readonly maxRetries: number;
  readonly retryBaseDelayMs: number;
  readonly cacheTtlMs: number;
}

export function createOpenRouterConfig(config: ConfigService): OpenRouterConfig {
  return {
    apiKey: config.get<string>('openrouter.apiKey') || null,
    baseUrl: config.getOrThrow<string>('openrouter.baseUrl').replace(/\/$/, ''),
    model: config.getOrThrow<string>('openrouter.model'),
    fastModel: config.getOrThrow<string>('openrouter.fastModel'),
    deepModel: config.getOrThrow<string>('openrouter.deepModel'),
    httpTimeoutMs: config.getOrThrow<number>('openrouter.httpTimeoutMs'),
    appName: config.getOrThrow<string>('openrouter.appName'),
    siteUrl: config.get<string>('openrouter.siteUrl') || null,
    maxRetries: config.getOrThrow<number>('openrouter.maxRetries'),
    retryBaseDelayMs: config.getOrThrow<number>('openrouter.retryBaseDelayMs'),
    cacheTtlMs: config.getOrThrow<number>('openrouter.cacheTtlMs'),
  };
}
