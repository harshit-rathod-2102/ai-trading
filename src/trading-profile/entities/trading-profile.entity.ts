import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('trading_profiles')
export class TradingProfile {
  @PrimaryColumn({ type: 'uuid' }) id!: string;

  @Column({ type: 'varchar', length: 160 }) name!: string;

  @Column({ type: 'varchar', length: 3 }) currency!: string;

  @Column({ name: 'account_capital', type: 'numeric', precision: 18, scale: 4 })
  accountCapital!: string;

  @Column({ name: 'risk_per_trade_percent', type: 'numeric', precision: 7, scale: 4 })
  riskPerTradePercent!: string;

  @Column({ name: 'max_position_percent', type: 'numeric', precision: 7, scale: 4 })
  maxPositionPercent!: string;

  @Column({ name: 'max_open_portfolio_risk_percent', type: 'numeric', precision: 7, scale: 4 })
  maxOpenPortfolioRiskPercent!: string;

  @Column({ name: 'max_sector_exposure_percent', type: 'numeric', precision: 7, scale: 4 })
  maxSectorExposurePercent!: string;

  @Column({ name: 'minimum_risk_reward_ratio', type: 'numeric', precision: 18, scale: 4 })
  minimumRiskRewardRatio!: string;

  @Column({ name: 'max_open_trades', type: 'integer' }) maxOpenTrades!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
