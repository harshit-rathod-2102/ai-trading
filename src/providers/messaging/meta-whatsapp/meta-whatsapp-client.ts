import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ProviderAuthenticationError,
  ProviderError,
  ProviderErrorCode,
  ProviderRateLimitError,
  ProviderUnavailableError,
} from '../../provider-error';
import { ProviderRequestContext } from '../../provider-request-context';
import { MetaSendMessageDto } from './dto/meta-send-message.dto';
import { MetaSendMessageResponseDto } from './dto/meta-send-message-response.dto';
import { META_WHATSAPP_CONFIG, MetaWhatsAppConfig } from './meta-whatsapp.config';

@Injectable()
export class MetaWhatsAppClient {
  private readonly logger = new Logger(MetaWhatsAppClient.name);

  constructor(@Inject(META_WHATSAPP_CONFIG) private readonly config: MetaWhatsAppConfig) {}

  async send(
    body: MetaSendMessageDto,
    context?: ProviderRequestContext,
  ): Promise<MetaSendMessageResponseDto> {
    if (context?.signal?.aborted) throw cancelled();
    const token = accessToken(this.config.accessToken);
    const phoneNumberId = phoneNumberIdValue(this.config.phoneNumberId);
    const url = `${this.config.baseUrl}/${this.config.graphApiVersion}/${encodeURIComponent(phoneNumberId)}/messages`;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchOnce(url, token, body, context);
        if (response.ok) return parseResponse(response);
        const details = await errorDetails(response);
        const error = mapHttpError(response, details);
        if (!shouldRetry(response.status) || attempt === this.config.maxRetries) {
          this.logger.error({ event: 'provider.request.failed', module: MetaWhatsAppClient.name,
            provider: 'meta-whatsapp', operation: 'sendMessage', endpoint: '/messages',
            statusCode: response.status, providerErrorCode: error.code,
            providerResponseCode: details.code, retryable: error.retryable,
            attempt: attempt + 1, maxAttempts: this.config.maxRetries + 1 },
          'Meta WhatsApp request failed');
          throw error;
        }
        const delayMs = retryDelay(attempt, this.config.retryBaseDelayMs, response);
        this.logger.warn({ event: 'provider.request.retrying', module: MetaWhatsAppClient.name,
          provider: 'meta-whatsapp', operation: 'sendMessage', endpoint: '/messages',
          statusCode: response.status, attempt: attempt + 1,
          maxAttempts: this.config.maxRetries + 1, delayMs,
          reason: error.code }, 'Meta WhatsApp request will be retried');
        await delay(delayMs, context?.signal);
      } catch (error: unknown) {
        if (error instanceof ProviderError) throw error;
        if (context?.signal?.aborted) throw cancelled();
        if (attempt === this.config.maxRetries) {
          this.logger.error({ event: 'provider.request.failed', module: MetaWhatsAppClient.name,
            provider: 'meta-whatsapp', operation: 'sendMessage', endpoint: '/messages',
            providerErrorCode: ProviderErrorCode.UNAVAILABLE, retryable: true,
            attempt: attempt + 1, maxAttempts: this.config.maxRetries + 1 },
          'Meta WhatsApp request failed after retries');
          throw new ProviderUnavailableError(
            'meta-whatsapp',
            'Meta WhatsApp request failed after bounded retries',
            error,
          );
        }
        const delayMs = retryDelay(attempt, this.config.retryBaseDelayMs);
        this.logger.warn({ event: 'provider.request.retrying', module: MetaWhatsAppClient.name,
          provider: 'meta-whatsapp', operation: 'sendMessage', endpoint: '/messages',
          attempt: attempt + 1, maxAttempts: this.config.maxRetries + 1,
          delayMs, reason: 'network_failure' }, 'Meta WhatsApp request will be retried');
        await delay(delayMs, context?.signal);
      }
    }
    throw new ProviderUnavailableError('meta-whatsapp');
  }

  private async fetchOnce(
    url: string,
    token: string,
    body: MetaSendMessageDto,
    context?: ProviderRequestContext,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.httpTimeoutMs);
    const cancel = () => controller.abort();
    context?.signal?.addEventListener('abort', cancel, { once: true });
    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
      context?.signal?.removeEventListener('abort', cancel);
    }
  }
}

async function parseResponse(response: Response): Promise<MetaSendMessageResponseDto> {
  try {
    return JSON.parse(await response.text()) as MetaSendMessageResponseDto;
  } catch {
    throw new ProviderError('Meta WhatsApp returned malformed JSON', {
      provider: 'meta-whatsapp', code: ProviderErrorCode.INVALID_RESPONSE, retryable: false,
    });
  }
}

interface ErrorDetails { readonly code?: number; readonly subcode?: number }

async function errorDetails(response: Response): Promise<ErrorDetails> {
  const text = (await response.text()).slice(0, 2000);
  try {
    const parsed = JSON.parse(text) as { error?: { code?: unknown; error_subcode?: unknown } };
    return {
      code: typeof parsed.error?.code === 'number' ? parsed.error.code : undefined,
      subcode: typeof parsed.error?.error_subcode === 'number' ? parsed.error.error_subcode : undefined,
    };
  } catch {
    return {};
  }
}

function mapHttpError(response: Response, details: ErrorDetails): ProviderError {
  const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
  if (response.status === 401 || details.code === 190) {
    return new ProviderAuthenticationError('meta-whatsapp', 'Meta WhatsApp access token is invalid or expired');
  }
  if (response.status === 429 || details.code === 4 || details.code === 613) {
    return new ProviderRateLimitError('meta-whatsapp', 'Meta WhatsApp rate limit was exceeded', retryAfter);
  }
  if (response.status >= 500) {
    return new ProviderUnavailableError('meta-whatsapp', `Meta WhatsApp is unavailable (HTTP ${response.status})`);
  }
  const providerCodes = [details.code, details.subcode].filter(value => value !== undefined).join('/');
  return new ProviderError(
    `Meta WhatsApp rejected the message (HTTP ${response.status}${providerCodes ? `, code ${providerCodes}` : ''})`,
    { provider: 'meta-whatsapp', code: ProviderErrorCode.REQUEST_REJECTED, retryable: false },
  );
}

function shouldRetry(status: number): boolean {
  return [429, 502, 503, 504].includes(status);
}

function accessToken(value: string | null): string {
  if (!value) throw new ProviderAuthenticationError(
    'meta-whatsapp',
    'META_WHATSAPP_ACCESS_TOKEN is required when MESSAGING_PROVIDER=meta-whatsapp',
  );
  return value;
}

function phoneNumberIdValue(value: string | null): string {
  if (!value) throw new ProviderError(
    'META_WHATSAPP_PHONE_NUMBER_ID is required when MESSAGING_PROVIDER=meta-whatsapp',
    { provider: 'meta-whatsapp', code: ProviderErrorCode.REQUEST_REJECTED, retryable: false },
  );
  return value;
}

function retryDelay(attempt: number, baseMs: number, response?: Response): number {
  const retryAfter = response ? parseRetryAfter(response.headers.get('retry-after')) : undefined;
  return Math.min(retryAfter === undefined ? baseMs * (2 ** attempt) : retryAfter * 1000, 30_000);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(cancelled());
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(cancelled());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

function cancelled(): ProviderError {
  return new ProviderError('Meta WhatsApp request was cancelled', {
    provider: 'meta-whatsapp', code: ProviderErrorCode.REQUEST_REJECTED, retryable: false,
  });
}
