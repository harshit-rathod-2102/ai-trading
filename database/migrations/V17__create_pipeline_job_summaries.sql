CREATE TABLE pipeline_job_summaries (
    id UUID PRIMARY KEY,
    pipeline_run_id UUID NOT NULL,
    status VARCHAR(16) NOT NULL,
    summary_snapshot JSONB NOT NULL,
    message_text TEXT NOT NULL,
    ai_provider VARCHAR(64),
    ai_model VARCHAR(255),
    ai_prompt_version VARCHAR(64),
    ai_request_id VARCHAR(255),
    messaging_provider VARCHAR(64),
    provider_message_id VARCHAR(255),
    delivery_attempts INTEGER NOT NULL DEFAULT 0,
    generated_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pipeline_job_summaries_run UNIQUE (pipeline_run_id),
    CONSTRAINT fk_pipeline_job_summaries_run
        FOREIGN KEY (pipeline_run_id) REFERENCES daily_pipeline_runs(id) ON DELETE CASCADE,
    CONSTRAINT ck_pipeline_job_summaries_status CHECK (status IN ('SENDING', 'SENT', 'FAILED')),
    CONSTRAINT ck_pipeline_job_summaries_delivery_attempts CHECK (delivery_attempts >= 0)
);

CREATE INDEX idx_pipeline_job_summaries_status
    ON pipeline_job_summaries (status, updated_at);
