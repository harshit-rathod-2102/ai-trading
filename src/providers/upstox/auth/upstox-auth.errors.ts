import { ProviderAuthenticationError } from '../../provider-error';

export class UpstoxAccessTokenUnavailableError extends ProviderAuthenticationError {
  readonly operationalCode = 'UPSTOX_ACCESS_TOKEN_UNAVAILABLE';

  constructor() {
    super('upstox', 'No valid Upstox access token is available');
    this.name = UpstoxAccessTokenUnavailableError.name;
  }
}

export class UpstoxAuthenticationFailedError extends ProviderAuthenticationError {
  readonly operationalCode = 'UPSTOX_AUTHENTICATION_FAILED';

  constructor(statusCode: number) {
    super('upstox', `Upstox authentication failed with HTTP ${statusCode}`);
    this.name = UpstoxAuthenticationFailedError.name;
  }
}
