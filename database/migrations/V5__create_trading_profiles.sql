CREATE TABLE trading_profiles (
    id UUID PRIMARY KEY,
    name VARCHAR(160) NOT NULL CHECK (name ~ '[^[:space:]]'),
    currency VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    account_capital NUMERIC(18,4) NOT NULL CHECK (account_capital > 0 AND account_capital <= 99999999999999.9999),
    risk_per_trade_percent NUMERIC(7,4) NOT NULL CHECK (risk_per_trade_percent > 0 AND risk_per_trade_percent <= 100),
    max_position_percent NUMERIC(7,4) NOT NULL CHECK (max_position_percent > 0 AND max_position_percent <= 100),
    max_open_portfolio_risk_percent NUMERIC(7,4) NOT NULL CHECK (max_open_portfolio_risk_percent > 0 AND max_open_portfolio_risk_percent <= 100),
    max_sector_exposure_percent NUMERIC(7,4) NOT NULL CHECK (max_sector_exposure_percent > 0 AND max_sector_exposure_percent <= 100),
    minimum_risk_reward_ratio NUMERIC(18,4) NOT NULL CHECK (minimum_risk_reward_ratio > 0 AND minimum_risk_reward_ratio <= 99999999999999.9999),
    max_open_trades INTEGER NOT NULL CHECK (max_open_trades > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT trading_profiles_trade_risk_within_portfolio
        CHECK (risk_per_trade_percent <= max_open_portfolio_risk_percent)
);

CREATE UNIQUE INDEX trading_profiles_one_active
    ON trading_profiles (is_active) WHERE is_active = TRUE;
