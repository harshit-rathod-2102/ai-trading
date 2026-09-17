ALTER TABLE trade_candidates
    ADD COLUMN scan_run_id UUID REFERENCES scan_runs(id) ON DELETE RESTRICT,
    ADD COLUMN scan_result_id UUID REFERENCES scan_results(id) ON DELETE RESTRICT,
    ADD COLUMN market_date DATE,
    ADD COLUMN scanner_version VARCHAR(64),
    ADD COLUMN sector VARCHAR(100),
    ADD COLUMN strategy_score NUMERIC(7,4),
    ADD COLUMN ranking_score NUMERIC(7,4),
    ADD COLUMN global_ranking_score NUMERIC(7,4),
    ADD COLUMN strategy_rank INTEGER,
    ADD COLUMN strategy_qualified_count INTEGER,
    ADD COLUMN global_rank INTEGER,
    ADD COLUMN global_qualified_count INTEGER,
    ADD COLUMN market_regime_snapshot JSONB,
    ADD COLUMN strategy_snapshot JSONB,
    ADD COLUMN ranking_snapshot JSONB,
    ADD CONSTRAINT uq_trade_candidates_scan_result UNIQUE (scan_result_id),
    ADD CONSTRAINT candidate_strategy_score_valid CHECK (
        strategy_score IS NULL OR
        (strategy_score >= 0 AND strategy_score <= 100 AND strategy_score <> 'NaN'::numeric)
    ),
    ADD CONSTRAINT candidate_ranking_score_valid CHECK (
        ranking_score IS NULL OR
        (ranking_score >= 0 AND ranking_score <= 100 AND ranking_score <> 'NaN'::numeric)
    ),
    ADD CONSTRAINT candidate_global_ranking_score_valid CHECK (
        global_ranking_score IS NULL OR
        (global_ranking_score >= 0 AND global_ranking_score <= 100 AND global_ranking_score <> 'NaN'::numeric)
    ),
    ADD CONSTRAINT candidate_rank_values_valid CHECK (
        (strategy_rank IS NULL OR strategy_rank > 0) AND
        (strategy_qualified_count IS NULL OR strategy_qualified_count > 0) AND
        (global_rank IS NULL OR global_rank > 0) AND
        (global_qualified_count IS NULL OR global_qualified_count > 0)
    ),
    ADD CONSTRAINT candidate_regime_snapshot_object CHECK (
        market_regime_snapshot IS NULL OR jsonb_typeof(market_regime_snapshot) = 'object'
    ),
    ADD CONSTRAINT candidate_strategy_snapshot_object CHECK (
        strategy_snapshot IS NULL OR jsonb_typeof(strategy_snapshot) = 'object'
    ),
    ADD CONSTRAINT candidate_ranking_snapshot_object CHECK (
        ranking_snapshot IS NULL OR jsonb_typeof(ranking_snapshot) = 'object'
    ),
    ADD CONSTRAINT candidate_orchestration_evidence_complete CHECK (
        scan_result_id IS NULL OR (
            scan_run_id IS NOT NULL AND
            market_date IS NOT NULL AND
            scanner_version IS NOT NULL AND
            strategy_score IS NOT NULL AND
            ranking_score IS NOT NULL AND
            global_ranking_score IS NOT NULL AND
            strategy_rank IS NOT NULL AND
            strategy_qualified_count IS NOT NULL AND
            global_rank IS NOT NULL AND
            global_qualified_count IS NOT NULL AND
            market_regime_snapshot IS NOT NULL AND
            strategy_snapshot IS NOT NULL AND
            ranking_snapshot IS NOT NULL
        )
    );

CREATE INDEX idx_candidates_scan_run ON trade_candidates (scan_run_id, global_rank)
    WHERE scan_run_id IS NOT NULL;
