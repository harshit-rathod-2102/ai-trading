import { Inject, Injectable, Logger } from '@nestjs/common';
import { gunzipSync } from 'node:zlib';
import {
  ProviderAuthenticationError,
  ProviderError,
  ProviderErrorCode,
  ProviderRateLimitError,
  ProviderUnavailableError,
} from '../../provider-error';
import { ProviderRequestContext } from '../../provider-request-context';
import { UpstoxAuthService } from './upstox-auth.service';
import { UPSTOX_CONFIG, UpstoxConfig } from './upstox.config';

@Injectable()
export class UpstoxClient {
  private readonly logger = new Logger(UpstoxClient.name);

  constructor(
    @Inject(UPSTOX_CONFIG) private readonly config: UpstoxConfig,
    private readonly auth: UpstoxAuthService,
  ) {}

  getJson<T>(path: string, context?: ProviderRequestContext): Promise<T> {
    return this.requestJson<T>(`${this.config.apiBaseUrl}${path}`, true, context);
  }

  async getInstrumentFile<T>(context?: ProviderRequestContext): Promise<T> {
    const bytes = await this.requestBytes(this.config.instrumentFileUrl, false, context);
    let payload = bytes;
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
      try {
        payload = gunzipSync(bytes);
      } catch {
        throw this.invalidResponse('Upstox instrument file could not be decompressed');
      }
    }
    try {
      return JSON.parse(payload.toString('utf8')) as T;
    } catch {
      throw this.invalidResponse('Upstox instrument file is not valid JSON');
    }
  }

  private async requestJson<T>(url: string, authenticated: boolean, context?: ProviderRequestContext): Promise<T> {
    const response = await this.request(url, authenticated, context);
    try {
      return JSON.parse(await response.text()) as T;
    } catch {
      throw this.invalidResponse('Upstox returned malformed JSON');
    }
  }

  private async requestBytes(url: string, authenticated: boolean, context?: ProviderRequestContext): Promise<Buffer> {
    const response = await this.request(url, authenticated, context);
    return Buffer.from(await response.arrayBuffer());
  }

  private async request(url: string, authenticated: boolean, context?: ProviderRequestContext): Promise<Response> {
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchOnce(url, authenticated, context);
        if (response.ok) return response;
        const error = this.httpError(response);
        if (!this.shouldRetryStatus(response.status) || attempt === this.config.maxRetries) {
          this.logger.error({ event: 'provider.request.failed', module: UpstoxClient.name,
            provider: 'upstox', operation: 'httpGet', endpoint: safeEndpoint(url),
            statusCode: response.status, providerErrorCode: error.code,
            retryable: error.retryable, attempt: attempt + 1,
            maxAttempts: this.config.maxRetries + 1 }, 'Upstox request failed');
          throw error;
        }
        const delayMs = this.retryDelay(attempt, error);
        this.logger.warn({ event: 'provider.request.retrying', module: UpstoxClient.name,
          provider: 'upstox', operation: 'httpGet', endpoint: safeEndpoint(url),
          statusCode: response.status, attempt: attempt + 1,
          maxAttempts: this.config.maxRetries + 1, delayMs,
          reason: error.code }, 'Upstox request will be retried');
        await this.delay(delayMs, context?.signal);
      } catch (error: unknown) {
        if (error instanceof ProviderError) throw error;
        if (context?.signal?.aborted) {
          throw new ProviderError('Upstox request was cancelled', {
            provider: 'upstox', code: ProviderErrorCode.REQUEST_REJECTED, retryable: false,
          });
        }
        if (attempt === this.config.maxRetries) {
          this.logger.error({ event: 'provider.request.failed', module: UpstoxClient.name,
            provider: 'upstox', operation: 'httpGet', endpoint: safeEndpoint(url),
            providerErrorCode: ProviderErrorCode.UNAVAILABLE, retryable: true,
            attempt: attempt + 1, maxAttempts: this.config.maxRetries + 1 },
          'Upstox request failed after retries');
          throw new ProviderUnavailableError('upstox', 'Upstox request failed after bounded retries', error);
        }
        const delayMs = this.retryDelay(attempt);
        this.logger.warn({ event: 'provider.request.retrying', module: UpstoxClient.name,
          provider: 'upstox', operation: 'httpGet', endpoint: safeEndpoint(url),
          attempt: attempt + 1, maxAttempts: this.config.maxRetries + 1,
          delayMs, reason: 'network_failure' }, 'Upstox request will be retried');
        await this.delay(delayMs, context?.signal);
      }
    }
    throw new ProviderUnavailableError('upstox');
  }

  private async fetchOnce(
    url: string,
    authenticated: boolean,
    context?: ProviderRequestContext,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.httpTimeoutMs);
    const cancel = () => controller.abort();
    context?.signal?.addEventListener('abort', cancel, { once: true });
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      if (authenticated) Object.assign(headers, this.auth.authorizationHeaders());
      return await fetch(url, { method: 'GET', headers, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      context?.signal?.removeEventListener('abort', cancel);
    }
  }

  private httpError(response: Response): ProviderError {
    const retryAfterSeconds = this.retryAfterSeconds(response.headers.get('retry-after'));
    if (response.status === 401 || response.status === 403) {
      return new ProviderAuthenticationError('upstox', `Upstox authentication failed with HTTP ${response.status}`);
    }
    if (response.status === 429) {
      return new ProviderRateLimitError('upstox', 'Upstox rate limit exceeded', retryAfterSeconds);
    }
    if (response.status >= 500) {
      return new ProviderUnavailableError('upstox', `Upstox is unavailable (HTTP ${response.status})`);
    }
    return new ProviderError(`Upstox rejected the request (HTTP ${response.status})`, {
      provider: 'upstox', code: ProviderErrorCode.REQUEST_REJECTED, retryable: false,
    });
  }

  private shouldRetryStatus(status: number): boolean {
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  private retryDelay(attempt: number, error?: ProviderError): number {
    const retryAfter = error instanceof ProviderRateLimitError ? error.retryAfterSeconds : undefined;
    return Math.min(retryAfter === undefined
      ? this.config.retryBaseDelayMs * (2 ** attempt)
      : retryAfter * 1000, 30_000);
  }

  private retryAfterSeconds(value: string | null): number | undefined {
    if (!value) return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds;
    const date = Date.parse(value);
    return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }

  private delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', cancel);
        resolve();
      }, milliseconds);
      const cancel = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        reject(new ProviderError('Upstox request was cancelled', {
          provider: 'upstox', code: ProviderErrorCode.REQUEST_REJECTED, retryable: false,
        }));
      };
      signal?.addEventListener('abort', cancel, { once: true });
    });
  }

  private invalidResponse(message: string): ProviderError {
    this.logger.error({ event: 'provider.response.invalid', module: UpstoxClient.name,
      provider: 'upstox', operation: 'parseResponse',
      providerErrorCode: ProviderErrorCode.INVALID_RESPONSE, retryable: false },
    'Upstox response was invalid');
    return new ProviderError(message, {
      provider: 'upstox', code: ProviderErrorCode.INVALID_RESPONSE, retryable: false,
    });
  }
}

function safeEndpoint(url: string): string {
  try { return new URL(url).pathname; } catch { return 'unknown'; }
}
