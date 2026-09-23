import { ConfigService } from '@nestjs/config';

export const META_WHATSAPP_CONFIG = Symbol('META_WHATSAPP_CONFIG');

export interface MetaWhatsAppConfig {
  readonly accessToken: string | null;
  readonly phoneNumberId: string | null;
  readonly businessAccountId: string | null;
  readonly verifyToken: string | null;
  readonly appSecret: string | null;
  readonly graphApiVersion: string;
  readonly baseUrl: string;
  readonly httpTimeoutMs: number;
  readonly allowedSender: string | null;
  readonly templateLanguage: string;
  readonly maxRetries: number;
  readonly retryBaseDelayMs: number;
  readonly dedupTtlSeconds: number;
}

export function createMetaWhatsAppConfig(config: ConfigService): MetaWhatsAppConfig {
  return {
    accessToken: config.get<string>('metaWhatsapp.accessToken') || null,
    phoneNumberId: config.get<string>('metaWhatsapp.phoneNumberId') || null,
    businessAccountId: config.get<string>('metaWhatsapp.businessAccountId') || null,
    verifyToken: config.get<string>('metaWhatsapp.verifyToken') || null,
    appSecret: config.get<string>('metaWhatsapp.appSecret') || null,
    graphApiVersion: config.getOrThrow<string>('metaWhatsapp.graphApiVersion'),
    baseUrl: config.getOrThrow<string>('metaWhatsapp.baseUrl').replace(/\/$/, ''),
    httpTimeoutMs: config.getOrThrow<number>('metaWhatsapp.httpTimeoutMs'),
    allowedSender: config.get<string>('metaWhatsapp.allowedSender') || null,
    templateLanguage: config.getOrThrow<string>('metaWhatsapp.templateLanguage'),
    maxRetries: config.getOrThrow<number>('metaWhatsapp.maxRetries'),
    retryBaseDelayMs: config.getOrThrow<number>('metaWhatsapp.retryBaseDelayMs'),
    dedupTtlSeconds: config.getOrThrow<number>('metaWhatsapp.dedupTtlSeconds'),
  };
}
