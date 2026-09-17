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
import { OpenRouterChatResponseDto } from './dto/openrouter-response.dto';
import { OPENROUTER_CONFIG, OpenRouterConfig } from './openrouter.config';

export class OpenRouterStructuredOutputUnsupportedError extends Error {}

@Injectable()
export class OpenRouterClient {
  private readonly logger = new Logger(OpenRouterClient.name);

  constructor(@Inject(OPENROUTER_CONFIG) private readonly config: OpenRouterConfig) {}

  async createChatCompletion(
    body: Readonly<Record<string, unknown>>,
    context?: ProviderRequestContext,
  ): Promise<OpenRouterChatResponseDto> {
    const response = await this.request(body, context);
    try {
      return JSON.parse(await response.text()) as OpenRouterChatResponseDto;
    } catch {
      throw invalidResponse('OpenRouter returned malformed JSON');
    }
  }

  private async request(
    body: Readonly<Record<string, unknown>>,
    context?: ProviderRequestContext,
  ): Promise<Response> {
    if (context?.signal?.aborted) throw cancelled();
    const apiKey = this.apiKey();
    const url = `${this.config.baseUrl}/chat/completions`;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchOnce(url, apiKey, body, context);
        if (response.ok) return response;
        const message = await providerMessage(response);
        if (isUnsupportedStructuredOutput(response.status, message)) {
          throw new OpenRouterStructuredOutputUnsupportedError(message);
        }
        const error = this.httpError(response);
        if (!shouldRetry(response.status) || attempt === this.config.maxRetries) {
          this.logger.error({ event: 'provider.request.failed', module: OpenRouterClient.name,
            provider: 'openrouter', operation: 'createChatCompletion', endpoint: '/chat/completions',
            statusCode: response.status, providerErrorCode: error.code,
            retryable: error.retryable, attempt: attempt + 1,
            maxAttempts: this.config.maxRetries + 1 }, 'OpenRouter request failed');
          throw error;
        }
        const delayMs = retryDelay(attempt, this.config.retryBaseDelayMs, response);
        this.logger.warn({ event: 'provider.request.retrying', module: OpenRouterClient.name,
          provider: 'openrouter', operation: 'createChatCompletion', endpoint: '/chat/completions',
          statusCode: response.status, attempt: attempt + 1,
          maxAttempts: this.config.maxRetries + 1, delayMs,
          reason: error.code }, 'OpenRouter request will be retried');
        await delay(delayMs, context?.signal);
      } catch (error: unknown) {
        if (error instanceof ProviderError || error instanceof OpenRouterStructuredOutputUnsupportedError) {
          throw error;
        }
        if (context?.signal?.aborted) throw cancelled();
        if (attempt === this.config.maxRetries) {
          this.logger.error({ event: 'provider.request.failed', module: OpenRouterClient.name,
            provider: 'openrouter', operation: 'createChatCompletion', endpoint: '/chat/completions',
            providerErrorCode: ProviderErrorCode.UNAVAILABLE, retryable: true,
            attempt: attempt + 1, maxAttempts: this.config.maxRetries + 1 },
          'OpenRouter request failed after retries');
          throw new ProviderUnavailableError(
            'openrouter',
            'OpenRouter request failed after bounded retries',
            error,
          );
        }
        const delayMs = retryDelay(attempt, this.config.retryBaseDelayMs);
        this.logger.warn({ event: 'provider.request.retrying', module: OpenRouterClient.name,
          provider: 'openrouter', operation: 'createChatCompletion', endpoint: '/chat/completions',
          attempt: attempt + 1, maxAttempts: this.config.maxRetries + 1,
          delayMs, reason: 'network_failure' }, 'OpenRouter request will be retried');
        await delay(delayMs, context?.signal);
      }
    }
    throw new ProviderUnavailableError('openrouter');
  }

  private async fetchOnce(
    url: string,
    apiKey: string,
    body: Readonly<Record<string, unknown>>,
    context?: ProviderRequestContext,
  ): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.httpTimeoutMs);
    const cancel = () => controller.abort();
    context?.signal?.addEventListener('abort', cancel, { once: true });
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-OpenRouter-Title': this.config.appName,
    };
    if (this.config.siteUrl) headers['HTTP-Referer'] = this.config.siteUrl;
    try {
      return await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (timedOut) {
        throw new ProviderTimeoutError(
          'openrouter',
          `OpenRouter request timed out after ${this.config.httpTimeoutMs} ms`,
          error,
        );
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
        'openrouter',
        'OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter',
      );
    }
    return this.config.apiKey;
  }

  private httpError(response: Response): ProviderError {
    const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
    if (response.status === 401) {
      return new ProviderAuthenticationError('openrouter', 'OpenRouter authentication failed');
    }
    if (response.status === 402) {
      return new ProviderRateLimitError('openrouter', 'OpenRouter credits or quota are unavailable', retryAfter);
    }
    if (response.status === 429) {
      return new ProviderRateLimitError('openrouter', 'OpenRouter request rate was exceeded', retryAfter);
    }
    if (response.status >= 500 || [408, 524, 529].includes(response.status)) {
      return new ProviderUnavailableError('openrouter', `OpenRouter is unavailable (HTTP ${response.status})`);
    }
    return new ProviderError(`OpenRouter rejected the request (HTTP ${response.status})`, {
      provider: 'openrouter',
      code: ProviderErrorCode.REQUEST_REJECTED,
      retryable: false,
    });
  }
}

async function providerMessage(response: Response): Promise<string> {
  const text = (await response.text()).slice(0, 1000);
  try {
    const value = JSON.parse(text) as { error?: { message?: unknown } | string; message?: unknown };
    if (typeof value.error === 'string') return value.error;
    if (value.error && typeof value.error.message === 'string') return value.error.message;
    if (typeof value.message === 'string') return value.message;
  } catch {
    // A bounded plain-text provider error is still useful for classification.
  }
  return text || 'request rejected';
}

function isUnsupportedStructuredOutput(status: number, message: string): boolean {
  return [400, 404, 422].includes(status)
    && /(response_format|json.schema|structured output)/i.test(message)
    && /(not supported|unsupported|does not support|unavailable)/i.test(message);
}

function shouldRetry(status: number): boolean {
  return [408, 429, 502, 503, 504, 524, 529].includes(status);
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
  return new ProviderError('OpenRouter request was cancelled', {
    provider: 'openrouter',
    code: ProviderErrorCode.REQUEST_REJECTED,
    retryable: false,
  });
}

function invalidResponse(message: string): ProviderError {
  return new ProviderError(message, {
    provider: 'openrouter',
    code: ProviderErrorCode.INVALID_RESPONSE,
    retryable: false,
  });
}
