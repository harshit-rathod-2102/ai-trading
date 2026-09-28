import { UpstoxTokenSource } from './upstox-token-source.enum';

export type UpstoxRequestStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'FAILED' | 'EXPIRED';

export interface UpstoxTokenStatus {
  readonly provider: 'UPSTOX';
  readonly configured: boolean;
  readonly authenticated: boolean;
  readonly source: UpstoxTokenSource | null;
  readonly issuedAt: string | null;
  readonly expiresAt: string | null;
  readonly expired: boolean;
  readonly reason: string | null;
  readonly requestStatus: UpstoxRequestStatus;
  readonly requestedAt: string | null;
  readonly requestExpiresAt: string | null;
}

export interface StoreUpstoxTokenInput {
  readonly accessToken: string;
  readonly issuedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly userId: string;
  readonly tokenType: 'Bearer';
}
