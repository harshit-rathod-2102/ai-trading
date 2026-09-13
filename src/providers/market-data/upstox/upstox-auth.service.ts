import { Inject, Injectable } from '@nestjs/common';
import { ProviderAuthenticationError } from '../../provider-error';
import { UPSTOX_CONFIG, UpstoxConfig } from './upstox.config';

@Injectable()
export class UpstoxAuthService {
  constructor(@Inject(UPSTOX_CONFIG) private readonly config: UpstoxConfig) {}

  authorizationHeaders(): Readonly<Record<string, string>> {
    if (!this.config.accessToken) {
      throw new ProviderAuthenticationError(
        'upstox',
        'UPSTOX_ACCESS_TOKEN is required when MARKET_DATA_PROVIDER=upstox',
      );
    }
    return { Authorization: `Bearer ${this.config.accessToken}` };
  }
}
