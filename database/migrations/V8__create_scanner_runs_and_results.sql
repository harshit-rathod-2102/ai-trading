CREATE TABLE scan_runs (
    id UUID PRIMARY KEY,
    market_date DATE NOT NULL,
    scanner_version VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('STARTED', 'SUCCESS', 'FAILED')),
    market_regime_snapshot JSONB,
    total_universe INTEGER NOT NULL DEFAULT 0 CHECK (total_universe >= 0),
    eligible_universe INTEGER NOT NULL DEFAULT 0 CHECK (eligible_universe >= 0),
    excluded_inactive INTEGER NOT NULL DEFAULT 0 CHECK (excluded_inactive >= 0),
    excluded_insufficient_history INTEGER NOT NULL DEFAULT 0 CHECK (excluded_insufficient_history >= 0),
    excluded_invalid_data INTEGER NOT NULL DEFAULT 0 CHECK (excluded_invalid_data >= 0),
    evaluated_symbols INTEGER NOT NULL DEFAULT 0 CHECK (evaluated_symbols >= 0),
    qualified_setups INTEGER NOT NULL DEFAULT 0 CHECK (qualified_setups >= 0),
    shortlisted_setups INTEGER NOT NULL DEFAULT 0 CHECK (shortlisted_setups >= 0),
    exclusions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(exclusions) = 'array'),
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT scan_run_date_version_unique UNIQUE (market_date, scanner_version),
    CONSTRAINT scan_run_completion_consistent CHECK (
        (status = 'STARTED' AND completed_at IS NULL) OR
        (status IN ('SUCCESS', 'FAILED') AND completed_at IS NOT NULL)
    )
);

CREATE TABLE scan_results (
    id UUID PRIMARY KEY,
    scan_run_id UUID NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
    instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
    symbol VARCHAR(32) NOT NULL,
    exchange VARCHAR(16) NOT NULL,
    sector VARCHAR(100),
    strategy VARCHAR(32) NOT NULL CHECK (strategy IN ('MOMENTUM_BREAKOUT', 'TREND_PULLBACK')),
    strategy_version VARCHAR(64) NOT NULL,
    strategy_score NUMERIC(7,4) NOT NULL CHECK (strategy_score >= 0 AND strategy_score <= 100 AND strategy_score <> 'NaN'::numeric),
    ranking_score NUMERIC(7,4) NOT NULL CHECK (ranking_score >= 0 AND ranking_score <= 100 AND ranking_score <> 'NaN'::numeric),
    global_ranking_score NUMERIC(7,4) NOT NULL CHECK (global_ranking_score >= 0 AND global_ranking_score <= 100 AND global_ranking_score <> 'NaN'::numeric),
    strategy_rank INTEGER NOT NULL CHECK (strategy_rank > 0),
    strategy_qualified_count INTEGER NOT NULL CHECK (strategy_qualified_count > 0),
    global_rank INTEGER NOT NULL CHECK (global_rank > 0),
    global_qualified_count INTEGER NOT NULL CHECK (global_qualified_count > 0),
    technical_snapshot JSONB NOT NULL,
    strategy_result JSONB NOT NULL,
    ranking_features JSONB NOT NULL,
    is_shortlisted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT scan_result_hypothesis_unique UNIQUE (scan_run_id, instrument_id, strategy)
);

CREATE INDEX scan_runs_latest ON scan_runs (market_date DESC, started_at DESC);
CREATE INDEX scan_results_ranked ON scan_results (scan_run_id, global_rank ASC);
CREATE INDEX scan_results_strategy_ranked ON scan_results (scan_run_id, strategy, strategy_rank ASC);
CREATE INDEX scan_results_shortlisted ON scan_results (scan_run_id, global_rank ASC) WHERE is_shortlisted;
