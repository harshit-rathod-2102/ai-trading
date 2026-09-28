ALTER TABLE trades
    ADD COLUMN unrealized_pnl NUMERIC(28,4),
    ADD COLUMN unrealized_pnl_percent NUMERIC(18,4),
    ADD COLUMN current_r NUMERIC(18,4),
    ADD COLUMN max_favorable_price NUMERIC(18,4),
    ADD COLUMN max_favorable_r NUMERIC(18,4),
    ADD COLUMN max_adverse_price NUMERIC(18,4),
    ADD COLUMN max_adverse_r NUMERIC(18,4),
    ADD COLUMN last_price_observed_at TIMESTAMPTZ,
    ADD COLUMN last_monitored_at TIMESTAMPTZ,
    ADD COLUMN monitoring_version VARCHAR(64),
    ADD CONSTRAINT trade_monitoring_prices_positive CHECK (
        (max_favorable_price IS NULL OR max_favorable_price > 0) AND
        (max_adverse_price IS NULL OR max_adverse_price > 0)
    ),
    ADD CONSTRAINT trade_monitoring_state_consistent CHECK (
        (
            last_monitored_at IS NULL AND monitoring_version IS NULL AND
            unrealized_pnl IS NULL AND unrealized_pnl_percent IS NULL AND current_r IS NULL AND
            max_favorable_price IS NULL AND max_favorable_r IS NULL AND
            max_adverse_price IS NULL AND max_adverse_r IS NULL AND
            last_price_observed_at IS NULL
        ) OR
        (
            last_monitored_at IS NOT NULL AND monitoring_version IS NOT NULL AND
            current_price IS NOT NULL AND unrealized_pnl IS NOT NULL AND
            unrealized_pnl_percent IS NOT NULL AND current_r IS NOT NULL AND
            max_favorable_price IS NOT NULL AND max_favorable_r IS NOT NULL AND
            max_adverse_price IS NOT NULL AND max_adverse_r IS NOT NULL AND
            last_price_observed_at IS NOT NULL
        )
    );

ALTER TABLE trade_events
    DROP CONSTRAINT trade_events_event_type_check;

ALTER TABLE trade_events
    ADD CONSTRAINT trade_events_event_type_check CHECK (
        event_type IN (
            'CANDIDATE_CREATED', 'CANDIDATE_QUALIFIED', 'CANDIDATE_WAIT',
            'CANDIDATE_REJECTED', 'CANDIDATE_NOTIFIED', 'CANDIDATE_SKIPPED',
            'TRADE_OPENED', 'STOP_CHANGED', 'TRADE_CLOSED', 'USER_NOTE',
            'PRICE_MILESTONE_REACHED', 'ADVERSE_MOVE_OBSERVED',
            'STOP_PROXIMITY_OBSERVED', 'STOP_BREACHED_OBSERVED',
            'TARGET1_REACHED', 'TARGET2_REACHED'
        )
    );

CREATE UNIQUE INDEX uq_event_trade_monitor_key
    ON trade_events (trade_id, (data ->> 'monitorKey'))
    WHERE trade_id IS NOT NULL AND data ? 'monitorKey';

CREATE INDEX idx_trades_open_monitoring
    ON trades (last_monitored_at NULLS FIRST, created_at)
    WHERE status = 'OPEN';
