import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn, JoinColumn, OneToOne } from 'typeorm';
import { TradeStatus } from '../../common/enums/trade-status.enum';
import { TradeCandidate } from '../../candidates/entities/trade-candidate.entity';

@Entity('trades')
export class Trade {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'candidate_id', type: 'uuid', unique: true })
  candidateId!: string;

  @OneToOne(() => TradeCandidate, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'candidate_id' })
  candidate!: TradeCandidate;
  @Column({ name: 'symbol', type: 'varchar', length: 32 })
  symbol!: string;

  @Column({ name: 'strategy', type: 'varchar', length: 100 })
  strategy!: string;

  @Column({ name: 'strategy_version', type: 'varchar', length: 100 })
  strategyVersion!: string;

  @Column({ name: 'status', type: 'varchar', length: 24 })
  status!: TradeStatus;

  @Column({ name: 'entry_decision_at', type: 'timestamptz' })
  entryDecisionAt!: Date;

  @Column({ name: 'planned_entry', type: 'numeric', precision: 18, scale: 4 })
  plannedEntry!: string;

  @Column({ name: 'actual_entry', type: 'numeric', precision: 18, scale: 4 })
  actualEntry!: string;

  @Column({ name: 'quantity', type: 'integer' })
  quantity!: number;

  @Column({ name: 'initial_stop', type: 'numeric', precision: 18, scale: 4 })
  initialStop!: string;

  @Column({ name: 'current_stop', type: 'numeric', precision: 18, scale: 4 })
  currentStop!: string;

  @Column({ name: 'target_1', type: 'numeric', precision: 18, scale: 4, nullable: true })
  target1!: string | null;

  @Column({ name: 'target_2', type: 'numeric', precision: 18, scale: 4, nullable: true })
  target2!: string | null;

  @Column({ name: 'initial_risk_amount', type: 'numeric', precision: 28, scale: 4 })
  initialRiskAmount!: string;

  @Column({ name: 'current_price', type: 'numeric', precision: 18, scale: 4, nullable: true })
  currentPrice!: string | null;

  @Column({ name: 'unrealized_pnl', type: 'numeric', precision: 28, scale: 4, nullable: true })
  unrealizedPnl!: string | null;

  @Column({ name: 'unrealized_pnl_percent', type: 'numeric', precision: 18, scale: 4, nullable: true })
  unrealizedPnlPercent!: string | null;

  @Column({ name: 'current_r', type: 'numeric', precision: 18, scale: 4, nullable: true })
  currentR!: string | null;

  @Column({ name: 'max_favorable_price', type: 'numeric', precision: 18, scale: 4, nullable: true })
  maxFavorablePrice!: string | null;

  @Column({ name: 'max_favorable_r', type: 'numeric', precision: 18, scale: 4, nullable: true })
  maxFavorableR!: string | null;

  @Column({ name: 'max_adverse_price', type: 'numeric', precision: 18, scale: 4, nullable: true })
  maxAdversePrice!: string | null;

  @Column({ name: 'max_adverse_r', type: 'numeric', precision: 18, scale: 4, nullable: true })
  maxAdverseR!: string | null;

  @Column({ name: 'last_price_observed_at', type: 'timestamptz', nullable: true })
  lastPriceObservedAt!: Date | null;

  @Column({ name: 'last_monitored_at', type: 'timestamptz', nullable: true })
  lastMonitoredAt!: Date | null;

  @Column({ name: 'monitoring_version', type: 'varchar', length: 64, nullable: true })
  monitoringVersion!: string | null;

  @Column({ name: 'realized_pnl', type: 'numeric', precision: 28, scale: 4 })
  realizedPnl!: string;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
