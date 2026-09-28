CREATE TABLE daily_pipeline_runs (
    id UUID PRIMARY KEY,
    market_date DATE NOT NULL,
    version VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL,
    trigger_source VARCHAR(16) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    market_data_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    scanner_run_id UUID,
    candidates_created INTEGER NOT NULL DEFAULT 0,
    candidates_risk_rejected INTEGER NOT NULL DEFAULT 0,
    candidates_total INTEGER NOT NULL DEFAULT 0,
    candidates_processed INTEGER NOT NULL DEFAULT 0,
    candidate_analysis_failures INTEGER NOT NULL DEFAULT 0,
    news_enriched INTEGER NOT NULL DEFAULT 0,
    fast_analyzed INTEGER NOT NULL DEFAULT 0,
    deep_analyzed INTEGER NOT NULL DEFAULT 0,
    qualified INTEGER NOT NULL DEFAULT 0,
    wait_count INTEGER NOT NULL DEFAULT 0,
    rejected INTEGER NOT NULL DEFAULT 0,
    notified INTEGER NOT NULL DEFAULT 0,
    news_failures INTEGER NOT NULL DEFAULT 0,
    ai_failures INTEGER NOT NULL DEFAULT 0,
    notification_failures INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT daily_pipeline_runs_status_check
        CHECK (status IN ('STARTED', 'SUCCESS', 'PARTIAL', 'FAILED')),
    CONSTRAINT daily_pipeline_runs_trigger_source_check
        CHECK (trigger_source IN ('SCHEDULED', 'MANUAL', 'CATCH_UP')),
    CONSTRAINT daily_pipeline_runs_counts_nonnegative CHECK (
        candidates_created >= 0 AND candidates_risk_rejected >= 0 AND
        candidates_total >= 0 AND candidates_processed >= 0 AND
        candidate_analysis_failures >= 0 AND news_enriched >= 0 AND
        fast_analyzed >= 0 AND deep_analyzed >= 0 AND qualified >= 0 AND
        wait_count >= 0 AND rejected >= 0 AND notified >= 0 AND
        news_failures >= 0 AND ai_failures >= 0 AND notification_failures >= 0
    ),
    CONSTRAINT uq_daily_pipeline_run UNIQUE (market_date, version)
);

CREATE INDEX idx_daily_pipeline_runs_status_date
    ON daily_pipeline_runs (status, market_date DESC);
