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

  @Column({ name: 'technical_snapshot', type: 'jsonb' })
  technicalSnapshot!: Record<string, unknown>;

  @Column({ name: 'risk_snapshot', type: 'jsonb' })
  riskSnapshot!: Record<string, unknown>;

  @Column({ name: 'ai_analysis', type: 'jsonb', nullable: true })
  aiAnalysis!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
