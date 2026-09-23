ALTER TABLE instruments
    ADD COLUMN provider VARCHAR(64),
    ADD COLUMN provider_instrument_id VARCHAR(160),
    ADD COLUMN provider_symbol VARCHAR(160),
    ADD COLUMN provider_metadata JSONB;

ALTER TABLE instruments ADD CONSTRAINT ck_instrument_provider_identity
    CHECK ((provider IS NULL) = (provider_instrument_id IS NULL));

CREATE UNIQUE INDEX uq_instruments_provider_identity
    ON instruments (provider, provider_instrument_id)
    WHERE provider IS NOT NULL AND provider_instrument_id IS NOT NULL;
