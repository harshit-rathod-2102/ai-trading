CREATE TABLE instruments (
    id UUID PRIMARY KEY,
    symbol VARCHAR(32) NOT NULL,
    exchange VARCHAR(16) NOT NULL CHECK (exchange = 'NSE'),
    name VARCHAR(160) NOT NULL CHECK (length(btrim(name)) > 0),
    type VARCHAR(16) NOT NULL CHECK (type IN ('EQUITY', 'INDEX')),
    sector VARCHAR(100),
    industry VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_instruments_exchange_symbol UNIQUE (exchange, symbol)
);
CREATE INDEX idx_instruments_active_type ON instruments (is_active, type);

CREATE TABLE universes (
    code VARCHAR(32) PRIMARY KEY CHECK (code ~ '^[A-Z0-9_-]{1,32}$'),
    name VARCHAR(160) NOT NULL CHECK (length(btrim(name)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE universe_memberships (
    universe_code VARCHAR(32) NOT NULL REFERENCES universes(code) ON DELETE RESTRICT,
    instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (universe_code, instrument_id)
);
CREATE INDEX idx_membership_instrument ON universe_memberships (instrument_id);

CREATE TABLE daily_candles (
    id UUID PRIMARY KEY,
    instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
    session_date DATE NOT NULL,
    open NUMERIC(18,4) NOT NULL CHECK (open > 0 AND open <> 'NaN'::numeric),
    high NUMERIC(18,4) NOT NULL CHECK (high > 0 AND high <> 'NaN'::numeric),
    low NUMERIC(18,4) NOT NULL CHECK (low > 0 AND low <> 'NaN'::numeric),
    close NUMERIC(18,4) NOT NULL CHECK (close > 0 AND close <> 'NaN'::numeric),
    volume NUMERIC(20,0) CHECK (volume >= 0 AND volume <> 'NaN'::numeric),
    provider VARCHAR(64) NOT NULL,
    is_synthetic BOOLEAN NOT NULL,
    adjustment_basis VARCHAR(32) NOT NULL CHECK (adjustment_basis IN ('UNADJUSTED', 'SPLIT_ADJUSTED', 'TOTAL_RETURN_ADJUSTED')),
    fetched_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (high >= low AND high >= open AND high >= close AND low <= open AND low <= close),
    CONSTRAINT uq_daily_candles_instrument_session UNIQUE (instrument_id, session_date)
);
-- The unique key also supports chronological per-instrument range scans.
CREATE INDEX idx_daily_candles_session ON daily_candles (session_date);
