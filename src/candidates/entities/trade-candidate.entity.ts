import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { CandidateStatus } from '../../common/enums/candidate-status.enum';

@Entity('trade_candidates')
export class TradeCandidate {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'symbol', type: 'varchar', length: 32 })
  symbol!: string;

  @Column({ name: 'exchange', type: 'varchar', length: 16 })
  exchange!: string;

  @Column({ name: 'strategy', type: 'varchar', length: 100 })
  strategy!: string;

  @Column({ name: 'strategy_version', type: 'varchar', length: 100 })
  strategyVersion!: string;

  @Column({ name: 'scan_run_id', type: 'uuid', nullable: true })
  scanRunId!: string | null;

  @Column({ name: 'scan_result_id', type: 'uuid', nullable: true, unique: true })
  scanResultId!: string | null;

  @Column({ name: 'market_date', type: 'date', nullable: true })
  marketDate!: string | null;

  @Column({ name: 'scanner_version', type: 'varchar', length: 64, nullable: true })
  scannerVersion!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sector!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 24 })
  status!: CandidateStatus;

  @Column({ name: 'detected_at', type: 'timestamptz' })
  detectedAt!: Date;

  @Column({ name: 'proposed_entry', type: 'numeric', precision: 18, scale: 4 })
  proposedEntry!: string;

  @Column({ name: 'proposed_stop', type: 'numeric', precision: 18, scale: 4 })
  proposedStop!: string;

  @Column({ name: 'target_1', type: 'numeric', precision: 18, scale: 4, nullable: true })
  target1!: string | null;

  @Column({ name: 'target_2', type: 'numeric', precision: 18, scale: 4, nullable: true })
  target2!: string | null;

  @Column({ name: 'suggested_quantity', type: 'integer' })
  suggestedQuantity!: number;

  @Column({ name: 'quant_score', type: 'numeric', precision: 7, scale: 4 })
  quantScore!: string;

  @Column({ name: 'strategy_score', type: 'numeric', precision: 7, scale: 4, nullable: true })
  strategyScore!: string | null;

  @Column({ name: 'ranking_score', type: 'numeric', precision: 7, scale: 4, nullable: true })
  rankingScore!: string | null;

  @Column({ name: 'global_ranking_score', type: 'numeric', precision: 7, scale: 4, nullable: true })
  globalRankingScore!: string | null;

  @Column({ name: 'strategy_rank', type: 'integer', nullable: true })
  strategyRank!: number | null;

  @Column({ name: 'strategy_qualified_count', type: 'integer', nullable: true })
  strategyQualifiedCount!: number | null;

  @Column({ name: 'global_rank', type: 'integer', nullable: true })
  globalRank!: number | null;

  @Column({ name: 'global_qualified_count', type: 'integer', nullable: true })
  globalQualifiedCount!: number | null;

  @Column({ name: 'technical_snapshot', type: 'jsonb' })
  technicalSnapshot!: Record<string, unknown>;

  @Column({ name: 'risk_snapshot', type: 'jsonb' })
  riskSnapshot!: Record<string, unknown>;

  @Column({ name: 'market_regime_snapshot', type: 'jsonb', nullable: true })
  marketRegimeSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'strategy_snapshot', type: 'jsonb', nullable: true })
  strategySnapshot!: Record<string, unknown> | null;

  @Column({ name: 'ranking_snapshot', type: 'jsonb', nullable: true })
  rankingSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'news_snapshot', type: 'jsonb', nullable: true })
  newsSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'news_enriched_at', type: 'timestamptz', nullable: true })
  newsEnrichedAt!: Date | null;

  @Column({ name: 'ai_analysis', type: 'jsonb', nullable: true })
  aiAnalysis!: Record<string, unknown> | null;

  @Column({ name: 'decision_snapshot', type: 'jsonb', nullable: true })
  decisionSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @Column({ name: 'notification_snapshot', type: 'jsonb', nullable: true })
  notificationSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'notified_at', type: 'timestamptz', nullable: true })
  notifiedAt!: Date | null;

  @Column({ name: 'notification_provider_message_id', type: 'varchar', length: 255, nullable: true })
  notificationProviderMessageId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
