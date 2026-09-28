INSERT INTO trading_profiles (
    id,
    name,
    currency,
    account_capital,
    risk_per_trade_percent,
    max_position_percent,
    max_open_portfolio_risk_percent,
    max_open_trades,
    max_sector_exposure_percent,
    minimum_risk_reward_ratio,
    is_active
) VALUES (
    '00000000-0000-4000-8000-000000000001',
    'Default Trading Profile',
    'INR',
    500000.0000,
    0.5000,
    20.0000,
    2.5000,
    6,
    30.0000,
    2.0000,
    TRUE
);
