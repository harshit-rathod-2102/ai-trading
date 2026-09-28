CREATE TABLE trade_candidates (
    id UUID PRIMARY KEY,
    symbol VARCHAR(32) NOT NULL,
    exchange VARCHAR(16) NOT NULL,
    strategy VARCHAR(100) NOT NULL,
    strategy_version VARCHAR(100) NOT NULL,
    status VARCHAR(24) NOT NULL CHECK (status IN ('NEW','ANALYZED','NOTIFIED','ACCEPTED','SKIPPED','EXPIRED','REJECTED')),
    detected_at TIMESTAMPTZ NOT NULL,
    proposed_entry NUMERIC(18,4) NOT NULL CHECK (proposed_entry > 0),
    proposed_stop NUMERIC(18,4) NOT NULL CHECK (proposed_stop > 0 AND proposed_stop < proposed_entry),
    target_1 NUMERIC(18,4) CHECK (target_1 > 0),
    target_2 NUMERIC(18,4) CHECK (target_2 > 0),
    suggested_quantity INTEGER NOT NULL CHECK (suggested_quantity > 0),
    quant_score NUMERIC(7,4) NOT NULL CHECK (quant_score BETWEEN 0 AND 100),
    technical_snapshot JSONB NOT NULL CHECK (jsonb_typeof(technical_snapshot) = 'object'),
    risk_snapshot JSONB NOT NULL CHECK (jsonb_typeof(risk_snapshot) = 'object'),
    ai_analysis JSONB CHECK (jsonb_typeof(ai_analysis) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_candidates_status_created ON trade_candidates (status, created_at);
CREATE INDEX idx_candidates_symbol_created ON trade_candidates (symbol, created_at);

CREATE TABLE trades (
    id UUID PRIMARY KEY,
    candidate_id UUID NOT NULL CONSTRAINT uq_trades_candidate UNIQUE REFERENCES trade_candidates(id) ON DELETE RESTRICT,
    symbol VARCHAR(32) NOT NULL,
    strategy VARCHAR(100) NOT NULL,
    strategy_version VARCHAR(100) NOT NULL,
    status VARCHAR(24) NOT NULL CHECK (status IN ('OPEN','PARTIALLY_CLOSED','CLOSED','STOPPED_OUT','CANCELLED')),
    entry_decision_at TIMESTAMPTZ NOT NULL,
    planned_entry NUMERIC(18,4) NOT NULL CHECK (planned_entry > 0),
    actual_entry NUMERIC(18,4) NOT NULL CHECK (actual_entry > 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    initial_stop NUMERIC(18,4) NOT NULL CHECK (initial_stop > 0 AND initial_stop < actual_entry),
    current_stop NUMERIC(18,4) NOT NULL CHECK (current_stop > 0),
    target_1 NUMERIC(18,4) CHECK (target_1 > 0),
    target_2 NUMERIC(18,4) CHECK (target_2 > 0),
    initial_risk_amount NUMERIC(28,4) NOT NULL CHECK (initial_risk_amount > 0),
    current_price NUMERIC(18,4) CHECK (current_price > 0),
    realized_pnl NUMERIC(28,4) NOT NULL DEFAULT 0,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_trades_id_candidate UNIQUE (id, candidate_id)
);
CREATE INDEX idx_trades_status_created ON trades (status, created_at);
CREATE INDEX idx_trades_symbol_created ON trades (symbol, created_at);

CREATE TABLE trade_events (
    id UUID PRIMARY KEY,
    trade_id UUID REFERENCES trades(id) ON DELETE RESTRICT,
    candidate_id UUID REFERENCES trade_candidates(id) ON DELETE RESTRICT,
    event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('CANDIDATE_CREATED','CANDIDATE_SKIPPED','TRADE_OPENED','STOP_CHANGED','TRADE_CLOSED','USER_NOTE')),
    source VARCHAR(16) NOT NULL CHECK (source IN ('SYSTEM','REST','WHATSAPP','AI')),
    price NUMERIC(18,4) CHECK (price > 0),
    quantity INTEGER CHECK (quantity > 0),
    data JSONB CHECK (jsonb_typeof(data) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK (trade_id IS NOT NULL OR candidate_id IS NOT NULL),
    FOREIGN KEY (trade_id, candidate_id) REFERENCES trades(id, candidate_id) ON DELETE RESTRICT
);
CREATE INDEX idx_events_trade_time ON trade_events (trade_id, created_at, id);
CREATE INDEX idx_events_candidate_time ON trade_events (candidate_id, created_at, id);
CREATE UNIQUE INDEX uq_event_candidate_created ON trade_events (candidate_id) WHERE event_type = 'CANDIDATE_CREATED';
CREATE UNIQUE INDEX uq_event_candidate_skipped ON trade_events (candidate_id) WHERE event_type = 'CANDIDATE_SKIPPED';
CREATE UNIQUE INDEX uq_event_trade_opened ON trade_events (trade_id) WHERE event_type = 'TRADE_OPENED';
