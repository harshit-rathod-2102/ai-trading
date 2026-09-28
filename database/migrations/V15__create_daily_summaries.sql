CREATE TABLE daily_summaries (
    id UUID PRIMARY KEY,
    market_date DATE NOT NULL,
    version VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL,
    summary_snapshot JSONB NOT NULL,
    message_text TEXT NOT NULL,
    provider VARCHAR(64),
    provider_message_id VARCHAR(255),
    delivery_attempts INTEGER NOT NULL DEFAULT 0,
    generated_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT daily_summaries_status_check
        CHECK (status IN ('GENERATED', 'SENDING', 'SENT', 'FAILED')),
    CONSTRAINT daily_summaries_attempts_nonnegative CHECK (delivery_attempts >= 0),
    CONSTRAINT daily_summaries_delivery_consistent CHECK (
        (status = 'SENT' AND provider IS NOT NULL AND provider_message_id IS NOT NULL AND sent_at IS NOT NULL) OR
        (status <> 'SENT')
    ),
    CONSTRAINT uq_daily_summary UNIQUE (market_date, version)
);

CREATE INDEX idx_daily_summaries_status_date
    ON daily_summaries (status, market_date DESC);
