import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export enum ProviderCredentialStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  INVALID = 'INVALID',
  FAILED = 'FAILED',
}

@Entity('provider_credentials')
export class ProviderCredential {
  @PrimaryColumn('uuid') id!: string;

  @Column({ type: 'varchar', length: 32 }) provider!: string;

  @Column({ name: 'credential_type', type: 'varchar', length: 32 }) credentialType!: string;

  @Column({ name: 'access_token_encrypted', type: 'text', nullable: true })
  accessTokenEncrypted!: string | null;

  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true }) issuedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true }) expiresAt!: Date | null;

  @Column({ type: 'varchar', length: 16 }) status!: ProviderCredentialStatus;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
