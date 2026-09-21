CREATE TABLE provider_credentials (
    id UUID PRIMARY KEY,
    provider VARCHAR(32) NOT NULL,
    credential_type VARCHAR(32) NOT NULL,
    access_token_encrypted TEXT,
    issued_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    status VARCHAR(16) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_provider_credentials_provider_type UNIQUE (provider, credential_type),
    CONSTRAINT ck_provider_credentials_status
        CHECK (status IN ('PENDING', 'ACTIVE', 'EXPIRED', 'INVALID', 'FAILED'))
);

CREATE INDEX idx_provider_credentials_status
    ON provider_credentials (provider, status);
