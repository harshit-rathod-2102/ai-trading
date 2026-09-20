import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ProviderAuthenticationError,
  ProviderError,
  ProviderErrorCode,
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from '../../provider-error';
import { ProviderRequestContext } from '../../provider-request-context';
import { GNEWS_CONFIG, GNewsConfig } from './gnews.config';

@Injectable()
export class GNewsClient {
  private readonly logger = new Logger(GNewsClient.name);

  constructor(@Inject(GNEWS_CONFIG) private readonly config: GNewsConfig) {}

  async search<T>(parameters: URLSearchParams, context?: ProviderRequestContext): Promise<T> {
    const response = await this.request(
      `${this.config.baseUrl}/search?${parameters.toString()}`,
      context,
    );
    try {
      return JSON.parse(await response.text()) as T;
    } catch {
      throw this.invalidResponse('GNews returned malformed JSON');
    }
  }

  private async request(url: string, context?: ProviderRequestContext): Promise<Response> {
    if (context?.signal?.aborted) throw this.cancelled();
    const apiKey = this.apiKey();
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchOnce(url, apiKey, context);
        if (response.ok) return response;
        const error = this.httpError(response);
        if (!this.shouldRetry(response.status) || attempt === this.config.maxRetries) {
          this.logger.error(
            {
              event: 'provider.request.failed',
              module: GNewsClient.name,
              provider: 'gnews',
              operation: 'search',
              endpoint: '/search',
              statusCode: response.status,
              providerErrorCode: error.code,
              retryable: error.retryable,
              attempt: attempt + 1,
              maxAttempts: this.config.maxRetries + 1,
            },
            'GNews request failed',
          );
          throw error;
        }
        const delayMs = this.retryDelay(attempt, error);
        this.logger.warn(
          {
            event: 'provider.request.retrying',
            module: GNewsClient.name,
            provider: 'gnews',
            operation: 'search',
            endpoint: '/search',
            statusCode: response.status,
            attempt: attempt + 1,
            maxAttempts: this.config.maxRetries + 1,
            delayMs,
            reason: error.code,
          },
          'GNews request will be retried',
        );
        await this.delay(delayMs, context?.signal);
      } catch (error: unknown) {
        if (error instanceof ProviderError) throw error;
        if (context?.signal?.aborted) throw this.cancelled();
        if (attempt === this.config.maxRetries) {
          this.logger.error(
            {
              event: 'provider.request.failed',
              module: GNewsClient.name,
              provider: 'gnews',
              operation: 'search',
              endpoint: '/search',
              providerErrorCode:
                error instanceof GNewsRequestTimeoutError
                  ? ProviderErrorCode.TIMEOUT
                  : ProviderErrorCode.UNAVAILABLE,
              retryable: true,
              attempt: attempt + 1,
              maxAttempts: this.config.maxRetries + 1,
            },
            'GNews request failed after retries',
          );
          if (error instanceof GNewsRequestTimeoutError) {
            throw new ProviderTimeoutError(
              'gnews',
              'GNews request timed out after bounded retries',
              error,
            );
          }
          throw new ProviderUnavailableError(
            'gnews',
            'GNews request failed after bounded retries',
            error,
          );
        }
        const delayMs = this.retryDelay(attempt);
        this.logger.warn(
          {
            event: 'provider.request.retrying',
            module: GNewsClient.name,
            provider: 'gnews',
            operation: 'search',
            endpoint: '/search',
            attempt: attempt + 1,
            maxAttempts: this.config.maxRetries + 1,
            delayMs,
            reason: error instanceof GNewsRequestTimeoutError ? 'timeout' : 'network_failure',
          },
          'GNews request will be retried',
        );
        await this.delay(delayMs, context?.signal);
      }
    }
    throw new ProviderUnavailableError('gnews');
  }

  private async fetchOnce(
    url: string,
    apiKey: string,
    context?: ProviderRequestContext,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.httpTimeoutMs);
    const cancel = () => controller.abort();
    context?.signal?.addEventListener('abort', cancel, { once: true });
    try {
      return await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'X-Api-Key': apiKey },
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (controller.signal.aborted && !context?.signal?.aborted) {
        throw new GNewsRequestTimeoutError(error);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      context?.signal?.removeEventListener('abort', cancel);
    }
  }

  private apiKey(): string {
    if (!this.config.apiKey) {
      throw new ProviderAuthenticationError(
        'gnews',
        'GNEWS_API_KEY is required when NEWS_PROVIDER=gnews',
      );
    }
    return this.config.apiKey;
  }

  private httpError(response: Response): ProviderError {
    const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
    if (response.status === 401) {
      return new ProviderAuthenticationError(
        'gnews',
        'GNews API key is missing, invalid, or expired',
      );
    }
    if (response.status === 403) {
      return new ProviderRateLimitError(
        'gnews',
        'GNews daily quota is exhausted',
        retryAfterSeconds,
      );
    }
    if (response.status === 429) {
      return new ProviderRateLimitError(
        'gnews',
        'GNews request rate was exceeded',
        retryAfterSeconds,
      );
    }
    if (response.status >= 500) {
      return new ProviderUnavailableError(
        'gnews',
        `GNews is unavailable (HTTP ${response.status})`,
      );
    }
    return new ProviderError(`GNews rejected the request (HTTP ${response.status})`, {
      provider: 'gnews',
      code: ProviderErrorCode.REQUEST_REJECTED,
      retryable: false,
    });
  }

  private shouldRetry(status: number): boolean {
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  private retryDelay(attempt: number, error?: ProviderError): number {
    const retryAfter =
      error instanceof ProviderRateLimitError ? error.retryAfterSeconds : undefined;
    return Math.min(
      retryAfter === undefined ? this.config.retryBaseDelayMs * 2 ** attempt : retryAfter * 1000,
      30_000,
    );
  }

  private delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(this.cancelled());
    return new Promise((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        reject(this.cancelled());
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', cancel);
        resolve();
      }, milliseconds);
      signal?.addEventListener('abort', cancel, { once: true });
    });
  }

  private cancelled(): ProviderError {
    return new ProviderError('GNews request was cancelled', {
      provider: 'gnews',
      code: ProviderErrorCode.REQUEST_REJECTED,
      retryable: false,
    });
  }

  private invalidResponse(message: string): ProviderError {
    this.logger.error(
      {
        event: 'provider.response.invalid',
        module: GNewsClient.name,
        provider: 'gnews',
        operation: 'parseResponse',
        providerErrorCode: ProviderErrorCode.INVALID_RESPONSE,
        retryable: false,
      },
      'GNews response was invalid',
    );
    return new ProviderError(message, {
      provider: 'gnews',
      code: ProviderErrorCode.INVALID_RESPONSE,
      retryable: false,
    });
  }
}

class GNewsRequestTimeoutError extends Error {
  constructor(cause: unknown) {
    super('GNews request timeout', { cause });
    this.name = GNewsRequestTimeoutError.name;
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}
