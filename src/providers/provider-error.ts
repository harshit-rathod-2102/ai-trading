export enum ProviderErrorCode {
  AUTHENTICATION = 'AUTHENTICATION',
  RATE_LIMIT = 'RATE_LIMIT',
  UNAVAILABLE = 'UNAVAILABLE',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  REQUEST_REJECTED = 'REQUEST_REJECTED',
}

export interface ProviderErrorOptions {
  readonly provider: string;
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly cause?: unknown;
}

export class ProviderError extends Error {
  readonly provider: string;
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  override readonly cause?: unknown;

  constructor(message: string, options: ProviderErrorOptions) {
    super(message);
    this.name = ProviderError.name;
    this.provider = options.provider;
    this.code = options.code;
    this.retryable = options.retryable;
    this.cause = options.cause;
  }
}

export class ProviderAuthenticationError extends ProviderError {
  constructor(provider: string, message = 'Provider authentication failed', cause?: unknown) {
    super(message, {
      provider,
      code: ProviderErrorCode.AUTHENTICATION,
      retryable: false,
      cause,
    });
    this.name = ProviderAuthenticationError.name;
  }
}

export class ProviderRateLimitError extends ProviderError {
  readonly retryAfterSeconds?: number;

  constructor(
    provider: string,
    message = 'Provider rate limit exceeded',
    retryAfterSeconds?: number,
    cause?: unknown,
  ) {
    super(message, {
      provider,
      code: ProviderErrorCode.RATE_LIMIT,
      retryable: true,
      cause,
    });
    this.name = ProviderRateLimitError.name;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ProviderUnavailableError extends ProviderError {
  constructor(provider: string, message = 'Provider is unavailable', cause?: unknown) {
    super(message, {
      provider,
      code: ProviderErrorCode.UNAVAILABLE,
      retryable: true,
      cause,
    });
    this.name = ProviderUnavailableError.name;
  }
}
