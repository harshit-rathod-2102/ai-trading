ALTER TABLE daily_pipeline_runs
    ADD COLUMN universe_code VARCHAR(32),
    ADD COLUMN execution_key VARCHAR(255);

UPDATE daily_pipeline_runs
SET universe_code = 'DEVELOPMENT', execution_key = 'daily'
WHERE universe_code IS NULL OR execution_key IS NULL;

ALTER TABLE daily_pipeline_runs
    ALTER COLUMN universe_code SET NOT NULL,
    ALTER COLUMN execution_key SET NOT NULL,
    DROP CONSTRAINT uq_daily_pipeline_run,
    ADD CONSTRAINT uq_daily_pipeline_run_universe_execution
        UNIQUE (market_date, version, universe_code, execution_key);

ALTER TABLE scan_runs
    ADD COLUMN universe_code VARCHAR(32),
    ADD COLUMN execution_key VARCHAR(255);

UPDATE scan_runs
SET universe_code = 'DEVELOPMENT', execution_key = 'daily'
WHERE universe_code IS NULL OR execution_key IS NULL;

ALTER TABLE scan_runs
    ALTER COLUMN universe_code SET NOT NULL,
    ALTER COLUMN execution_key SET NOT NULL,
    DROP CONSTRAINT scan_run_date_version_unique,
    ADD CONSTRAINT scan_run_universe_execution_unique
        UNIQUE (market_date, scanner_version, universe_code, execution_key);

ALTER TABLE market_regime_snapshots
    ADD COLUMN universe_code VARCHAR(32);

UPDATE market_regime_snapshots
SET universe_code = 'DEVELOPMENT'
WHERE universe_code IS NULL;

ALTER TABLE market_regime_snapshots
    ALTER COLUMN universe_code SET NOT NULL,
    DROP CONSTRAINT market_regime_snapshot_date_version_unique,
    ADD CONSTRAINT market_regime_snapshot_universe_unique
        UNIQUE (market_date, version, universe_code);
