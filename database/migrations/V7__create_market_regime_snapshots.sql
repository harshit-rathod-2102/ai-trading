CREATE TABLE market_regime_snapshots (
    id UUID PRIMARY KEY,
    market_date DATE NOT NULL,
    regime VARCHAR(16) NOT NULL CHECK (regime IN ('BULLISH', 'NEUTRAL', 'BEARISH', 'RISK_OFF')),
    score NUMERIC(7,4) NOT NULL CHECK (score >= -100 AND score <= 100 AND score <> 'NaN'::numeric),
    confidence VARCHAR(8) NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
    version VARCHAR(64) NOT NULL,
    components JSONB NOT NULL,
    reasons JSONB NOT NULL CHECK (jsonb_typeof(reasons) = 'array'),
    warnings JSONB NOT NULL CHECK (jsonb_typeof(warnings) = 'array'),
    calculated_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT market_regime_snapshot_date_version_unique UNIQUE (market_date, version)
);

CREATE INDEX market_regime_snapshots_latest
    ON market_regime_snapshots (market_date DESC, calculated_at DESC);
