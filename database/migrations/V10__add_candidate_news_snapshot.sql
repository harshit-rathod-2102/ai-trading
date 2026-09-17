ALTER TABLE trade_candidates
    ADD COLUMN news_snapshot JSONB,
    ADD COLUMN news_enriched_at TIMESTAMPTZ,
    ADD CONSTRAINT candidate_news_snapshot_object CHECK (
        news_snapshot IS NULL OR jsonb_typeof(news_snapshot) = 'object'
    ),
    ADD CONSTRAINT candidate_news_snapshot_timestamp_consistent CHECK (
        (news_snapshot IS NULL AND news_enriched_at IS NULL) OR
        (news_snapshot IS NOT NULL AND news_enriched_at IS NOT NULL)
    );

CREATE INDEX idx_candidates_news_enriched
    ON trade_candidates (news_enriched_at DESC)
    WHERE news_snapshot IS NOT NULL;
