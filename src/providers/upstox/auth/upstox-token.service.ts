import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { structuredError } from '../../../logging/logging.utils';
import { CredentialEncryptionService } from './credential-encryption.service';
import {
  ProviderCredential,
  ProviderCredentialStatus,
} from './entities/provider-credential.entity';
import { UpstoxAccessTokenUnavailableError } from './upstox-auth.errors';
import {
  StoreUpstoxTokenInput,
  UpstoxRequestStatus,
  UpstoxTokenStatus,
} from './models/upstox-token-status.model';
import { UpstoxTokenSource } from './models/upstox-token-source.enum';

const PROVIDER = 'UPSTOX';
const CREDENTIAL_TYPE = 'ACCESS_TOKEN';
const LOCK_KEY = 'provider-credential:UPSTOX:ACCESS_TOKEN';
const REQUEST_START_GRACE_MS = 2 * 60 * 1000;

interface RequestClaim {
  readonly started: boolean;
  readonly status: 'PENDING_APPROVAL' | 'ALREADY_AUTHENTICATED';
  readonly requestedAt: Date;
  readonly requestExpiresAt: Date | null;
}

@Injectable()
export class UpstoxTokenService {
  private readonly logger = new Logger(UpstoxTokenService.name);

  private envFallbackInvalidated = false;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ProviderCredential)
    private readonly credentials: Repository<ProviderCredential>,
    private readonly config: ConfigService,
    private readonly encryption: CredentialEncryptionService,
  ) {}

  async getValidAccessToken(): Promise<string> {
    const credential = await this.current();
    if (credential?.status === ProviderCredentialStatus.ACTIVE && credential.accessTokenEncrypted) {
      if (this.isExpired(credential)) {
        await this.markExpired(credential);
      } else {
        try {
          return this.encryption.decrypt(credential.accessTokenEncrypted);
        } catch (error: unknown) {
          this.logger.error(
            {
              event: 'upstox.auth.token.decrypt_failed',
              provider: 'upstox',
              ...structuredError(error),
            },
            'Upstox runtime token could not be decrypted',
          );
        }
      }
    }
    const fallback = this.envFallback();
    if (fallback) return fallback;
    throw new UpstoxAccessTokenUnavailableError();
  }

  async getStatus(): Promise<UpstoxTokenStatus> {
    const credential = await this.current();
    let reason: string | null = 'NO_VALID_TOKEN';
    let runtimeValid = false;
    let expired = credential?.status === ProviderCredentialStatus.EXPIRED;
    if (expired) reason = 'RUNTIME_TOKEN_EXPIRED';
    if (credential?.status === ProviderCredentialStatus.ACTIVE && credential.accessTokenEncrypted) {
      expired = this.isExpired(credential);
      if (expired) {
        reason = 'RUNTIME_TOKEN_EXPIRED';
        await this.markExpired(credential);
      } else {
        try {
          this.encryption.decrypt(credential.accessTokenEncrypted);
          runtimeValid = true;
          reason = null;
        } catch (error: unknown) {
          reason = this.encryption.configured()
            ? 'RUNTIME_TOKEN_DECRYPTION_FAILED'
            : 'CREDENTIAL_ENCRYPTION_KEY_UNAVAILABLE';
          this.logger.warn(
            {
              event: 'upstox.auth.status.runtime_unavailable',
              provider: 'upstox',
              reason,
              errorName: error instanceof Error ? error.name : 'UnknownError',
            },
            'Upstox runtime token is unavailable',
          );
        }
      }
    }
    const fallback = this.envFallback();
    const source = runtimeValid
      ? UpstoxTokenSource.RUNTIME
      : fallback
        ? UpstoxTokenSource.ENV_FALLBACK
        : null;
    if (fallback && !runtimeValid) reason = null;
    const status: UpstoxTokenStatus = {
      provider: PROVIDER,
      configured: this.authRequestConfigured(),
      authenticated: source !== null,
      source,
      issuedAt: runtimeValid ? toIso(credential?.issuedAt) : null,
      expiresAt: runtimeValid ? toIso(credential?.expiresAt) : null,
      expired: source === null && expired,
      reason,
      requestStatus: requestStatus(credential),
      requestedAt: metadataDate(credential, 'requestedAt'),
      requestExpiresAt: metadataDate(credential, 'requestExpiresAt'),
    };
    this.logger.debug(
      {
        event: 'upstox.auth.status.checked',
        provider: 'upstox',
        configured: status.configured,
        authenticated: status.authenticated,
        source: status.source,
        expiresAt: status.expiresAt,
        requestStatus: status.requestStatus,
      },
      'Upstox authentication status checked',
    );
    return status;
  }

  async storeRuntimeToken(input: StoreUpstoxTokenInput): Promise<void> {
    const encrypted = this.encryption.encrypt(input.accessToken);
    await this.withLockedCredential(async (repository, credential) => {
      const row = credential ?? repository.create({ id: randomUUID() });
      row.provider = PROVIDER;
      row.credentialType = CREDENTIAL_TYPE;
      row.accessTokenEncrypted = encrypted;
      row.issuedAt = input.issuedAt;
      row.expiresAt = input.expiresAt;
      row.status = ProviderCredentialStatus.ACTIVE;
      row.metadata = {
        ...row.metadata,
        requestStatus: 'APPROVED',
        approvedAt: new Date().toISOString(),
        userId: input.userId,
        tokenType: input.tokenType,
        lastRequestError: null,
      };
      await repository.save(row);
    });
    this.logger.log(
      {
        event: 'upstox.auth.token.stored',
        provider: 'upstox',
        source: UpstoxTokenSource.RUNTIME,
        issuedAt: toIso(input.issuedAt),
        expiresAt: toIso(input.expiresAt),
      },
      'Upstox runtime token stored',
    );
  }

  async invalidateCurrentToken(reason = 'PROVIDER_REJECTED'): Promise<void> {
    const runtimeInvalidated = await this.withLockedCredential(async (repository, credential) => {
      if (!credential || credential.status !== ProviderCredentialStatus.ACTIVE) return false;
      credential.status = ProviderCredentialStatus.INVALID;
      credential.metadata = {
        ...credential.metadata,
        invalidatedAt: new Date().toISOString(),
        invalidationReason: reason,
      };
      await repository.save(credential);
      return true;
    });
    if (!runtimeInvalidated) this.envFallbackInvalidated = true;
    this.logger.warn(
      {
        event: 'upstox.auth.token.invalidated',
        provider: 'upstox',
        source: runtimeInvalidated ? UpstoxTokenSource.RUNTIME : UpstoxTokenSource.ENV_FALLBACK,
        reason,
      },
      'Upstox access token invalidated',
    );
  }

  async beginTokenRequest(): Promise<RequestClaim> {
    return this.withLockedCredential(async (repository, credential) => {
      const now = new Date();
      if (
        credential?.status === ProviderCredentialStatus.ACTIVE &&
        credential.accessTokenEncrypted &&
        !this.isExpired(credential)
      ) {
        return {
          started: false,
          status: 'ALREADY_AUTHENTICATED',
          requestedAt: now,
          requestExpiresAt: null,
        };
      }
      const requestedAt = metadataDateValue(credential, 'requestedAt');
      const requestExpiresAt = metadataDateValue(credential, 'requestExpiresAt');
      const recentUnconfirmed =
        requestedAt !== null && now.getTime() - requestedAt.getTime() < REQUEST_START_GRACE_MS;
      if (
        credential?.status === ProviderCredentialStatus.PENDING &&
        ((requestExpiresAt !== null && requestExpiresAt > now) ||
          (requestExpiresAt === null && recentUnconfirmed))
      ) {
        return {
          started: false,
          status: 'PENDING_APPROVAL',
          requestedAt: requestedAt ?? now,
          requestExpiresAt,
        };
      }
      const row = credential ?? repository.create({ id: randomUUID() });
      row.provider = PROVIDER;
      row.credentialType = CREDENTIAL_TYPE;
      row.status = ProviderCredentialStatus.PENDING;
      row.metadata = {
        ...row.metadata,
        requestStatus: 'PENDING',
        requestedAt: now.toISOString(),
        requestExpiresAt: null,
        lastRequestError: null,
      };
      await repository.save(row);
      return {
        started: true,
        status: 'PENDING_APPROVAL',
        requestedAt: now,
        requestExpiresAt: null,
      };
    });
  }

  async markRequestPending(requestedAt: Date, requestExpiresAt: Date): Promise<void> {
    await this.withLockedCredential(async (repository, credential) => {
      if (!credential) return;
      credential.status = ProviderCredentialStatus.PENDING;
      credential.metadata = {
        ...credential.metadata,
        requestStatus: 'PENDING',
        requestedAt: requestedAt.toISOString(),
        requestExpiresAt: requestExpiresAt.toISOString(),
        lastRequestError: null,
      };
      await repository.save(credential);
    });
  }

  async markRequestFailed(reason: string): Promise<void> {
    await this.withLockedCredential(async (repository, credential) => {
      if (!credential) return;
      credential.status = ProviderCredentialStatus.FAILED;
      credential.metadata = {
        ...credential.metadata,
        requestStatus: 'FAILED',
        failedAt: new Date().toISOString(),
        lastRequestError: reason,
      };
      await repository.save(credential);
    });
  }

  private authRequestConfigured(): boolean {
    return Boolean(
      this.config.get<string>('upstox.clientId') && this.config.get<string>('upstox.clientSecret'),
    );
  }

  private envFallback(): string | null {
    if (this.envFallbackInvalidated) return null;
    return this.config.get<string>('upstox.accessToken') || null;
  }

  private current(): Promise<ProviderCredential | null> {
    return this.credentials.findOneBy({ provider: PROVIDER, credentialType: CREDENTIAL_TYPE });
  }

  private isExpired(credential: ProviderCredential): boolean {
    return credential.expiresAt !== null && credential.expiresAt.getTime() <= Date.now();
  }

  private async markExpired(credential: ProviderCredential): Promise<void> {
    if (credential.status !== ProviderCredentialStatus.ACTIVE) return;
    const changed = await this.credentials.update(
      { id: credential.id, status: ProviderCredentialStatus.ACTIVE },
      {
        status: ProviderCredentialStatus.EXPIRED,
        metadata: {
          ...credential.metadata,
          tokenExpiredAt: new Date().toISOString(),
        },
      },
    );
    if (changed.affected) {
      this.logger.warn(
        {
          event: 'upstox.auth.token.expired',
          provider: 'upstox',
          expiresAt: toIso(credential.expiresAt),
        },
        'Upstox runtime token expired',
      );
    }
  }

  private async withLockedCredential<T>(
    work: (
      repository: Repository<ProviderCredential>,
      credential: ProviderCredential | null,
    ) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [LOCK_KEY]);
      const repository = manager.getRepository(ProviderCredential);
      const credential = await repository.findOneBy({
        provider: PROVIDER,
        credentialType: CREDENTIAL_TYPE,
      });
      return work(repository, credential);
    });
  }
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function metadataDate(
  credential: ProviderCredential | null | undefined,
  key: string,
): string | null {
  return toIso(metadataDateValue(credential, key));
}

function metadataDateValue(
  credential: ProviderCredential | null | undefined,
  key: string,
): Date | null {
  const value = credential?.metadata?.[key];
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function requestStatus(credential: ProviderCredential | null): UpstoxRequestStatus {
  const value = credential?.metadata?.requestStatus;
  if (value === 'PENDING') {
    const expiry = metadataDateValue(credential, 'requestExpiresAt');
    if (expiry && expiry.getTime() <= Date.now()) return 'EXPIRED';
  }
  return value === 'PENDING' || value === 'APPROVED' || value === 'FAILED' || value === 'EXPIRED'
    ? value
    : 'NONE';
}
