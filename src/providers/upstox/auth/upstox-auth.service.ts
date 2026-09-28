import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { elapsedMilliseconds, structuredError } from '../../../logging/logging.utils';
import { UPSTOX_CONFIG, UpstoxConfig } from '../upstox.config';
import { UpstoxAccessTokenWebhookDto } from './dto/upstox-access-token-webhook.dto';
import { UpstoxTokenService } from './upstox-token.service';

interface UpstoxTokenRequestResponse {
  readonly status?: unknown;
  readonly data?: {
    readonly authorization_expiry?: unknown;
    readonly notifier_url?: unknown;
  };
}

export interface UpstoxTokenRequestResult {
  readonly status: 'PENDING_APPROVAL' | 'ALREADY_AUTHENTICATED';
  readonly requestedAt: string;
  readonly expiresAt: string | null;
  readonly reused: boolean;
}

@Injectable()
export class UpstoxAuthService {
  private readonly logger = new Logger(UpstoxAuthService.name);

  constructor(
    @Inject(UPSTOX_CONFIG) private readonly config: UpstoxConfig,
    private readonly tokens: UpstoxTokenService,
  ) {}

  async requestAccessToken(): Promise<UpstoxTokenRequestResult> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Upstox token requests require UPSTOX_CLIENT_ID and UPSTOX_CLIENT_SECRET',
        code: 'UPSTOX_AUTH_NOT_CONFIGURED',
      });
    }
    const claim = await this.tokens.beginTokenRequest();
    if (!claim.started) {
      this.logger.log(
        {
          event: 'upstox.auth.request.pending',
          provider: 'upstox',
          requestStatus: claim.status,
          requestedAt: claim.requestedAt.toISOString(),
          expiresAt: claim.requestExpiresAt?.toISOString() ?? null,
        },
        'Upstox token request reused',
      );
      return {
        status: claim.status,
        requestedAt: claim.requestedAt.toISOString(),
        expiresAt: claim.requestExpiresAt?.toISOString() ?? null,
        reused: true,
      };
    }
    const startedAt = performance.now();
    this.logger.log(
      {
        event: 'upstox.auth.request.started',
        provider: 'upstox',
        requestStatus: 'PENDING',
      },
      'Upstox token request started',
    );
    try {
      const response = await this.postTokenRequest(this.config.clientId, this.config.clientSecret);
      const expiry = parseEpochMilliseconds(response.data?.authorization_expiry);
      if (response.status !== 'success' || !expiry) {
        throw new BadGatewayException({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Upstox returned an invalid token-request response',
          code: 'UPSTOX_AUTH_REQUEST_INVALID_RESPONSE',
        });
      }
      await this.tokens.markRequestPending(claim.requestedAt, expiry);
      this.logger.log(
        {
          event: 'upstox.auth.request.pending',
          provider: 'upstox',
          requestStatus: 'PENDING',
          requestedAt: claim.requestedAt.toISOString(),
          expiresAt: expiry.toISOString(),
          durationMs: elapsedMilliseconds(startedAt),
        },
        'Upstox token request awaits user approval',
      );
      return {
        status: 'PENDING_APPROVAL',
        requestedAt: claim.requestedAt.toISOString(),
        expiresAt: expiry.toISOString(),
        reused: false,
      };
    } catch (error: unknown) {
      const reason = requestFailureReason(error);
      await this.tokens.markRequestFailed(reason);
      this.logger.error(
        {
          event: 'upstox.auth.request.failed',
          provider: 'upstox',
          requestStatus: 'FAILED',
          durationMs: elapsedMilliseconds(startedAt),
          reason,
          ...structuredError(error),
        },
        'Upstox token request failed',
      );
      throw error;
    }
  }

  async receiveAccessToken(payload: UpstoxAccessTokenWebhookDto): Promise<{ status: 'ACCEPTED' }> {
    const startedAt = performance.now();
    this.logger.log(
      {
        event: 'upstox.auth.webhook.received',
        provider: 'upstox',
        messageType: payload.message_type,
      },
      'Upstox access-token webhook received',
    );
    try {
      if (!this.config.clientId || payload.client_id !== this.config.clientId) {
        throw new BadRequestException('Webhook client_id does not match the configured Upstox app');
      }
      if (payload.message_type !== 'access_token' || payload.token_type !== 'Bearer') {
        throw new BadRequestException('Unexpected Upstox webhook message or token type');
      }
      const issuedAt = parseEpochMilliseconds(payload.issued_at);
      const expiresAt = parseEpochMilliseconds(payload.expires_at);
      if (!issuedAt || !expiresAt || issuedAt >= expiresAt) {
        throw new BadRequestException('Upstox webhook timestamps are invalid');
      }
      if (expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('Upstox webhook token is already expired');
      }
      await this.tokens.storeRuntimeToken({
        accessToken: payload.access_token,
        issuedAt,
        expiresAt,
        userId: payload.user_id,
        tokenType: payload.token_type,
      });
      return { status: 'ACCEPTED' };
    } catch (error: unknown) {
      this.logger.warn(
        {
          event: 'upstox.auth.webhook.rejected',
          provider: 'upstox',
          durationMs: elapsedMilliseconds(startedAt),
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : 'Unknown failure',
        },
        'Upstox access-token webhook rejected',
      );
      throw error;
    }
  }

  private async postTokenRequest(
    clientId: string,
    clientSecret: string,
  ): Promise<UpstoxTokenRequestResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.httpTimeoutMs);
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/v3/login/auth/token/request/${encodeURIComponent(clientId)}`,
        {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_secret: clientSecret }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new BadGatewayException({
          statusCode: 502,
          error: 'Bad Gateway',
          message: `Upstox rejected the token request with HTTP ${response.status}`,
          code: 'UPSTOX_AUTH_REQUEST_REJECTED',
        });
      }
      return (await response.json()) as UpstoxTokenRequestResponse;
    } catch (error: unknown) {
      if (error instanceof BadGatewayException) throw error;
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Upstox token-request endpoint is unavailable',
        code: 'UPSTOX_AUTH_REQUEST_UNAVAILABLE',
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseEpochMilliseconds(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{13}$/.test(value)) return null;
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function requestFailureReason(error: unknown): string {
  if (error instanceof BadGatewayException) return 'PROVIDER_REJECTED_OR_INVALID_RESPONSE';
  if (error instanceof ServiceUnavailableException) return 'PROVIDER_UNAVAILABLE';
  return 'UNEXPECTED_FAILURE';
}
