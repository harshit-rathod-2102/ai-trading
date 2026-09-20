import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { TechnicalIndicatorSnapshot } from '../../indicators/models/technical-indicators.model';
import { StrategyResult } from '../../strategy/contracts/strategy-result.model';
import { StrategyName } from '../../strategy/models/strategy-name.enum';
import { RankingEvidence } from '../models/scan-result.model';
import { ScanRun } from './scan-run.entity';

@Entity('scan_results')
export class ScanResultRecord {
  @PrimaryColumn('uuid') id!: string;
  @Column({ name: 'scan_run_id', type: 'uuid' }) scanRunId!: string;
  @ManyToOne(() => ScanRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scan_run_id' })
  scanRun!: ScanRun;
  @Column({ name: 'instrument_id', type: 'uuid' }) instrumentId!: string;
  @Column({ type: 'varchar', length: 32 }) symbol!: string;
  @Column({ type: 'varchar', length: 16 }) exchange!: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) sector!: string | null;
  @Column({ type: 'varchar', length: 32 }) strategy!: StrategyName;
  @Column({ name: 'strategy_version', type: 'varchar', length: 64 }) strategyVersion!: string;
  @Column({ name: 'strategy_score', type: 'numeric', precision: 7, scale: 4 })
  strategyScore!: string;
  @Column({ name: 'ranking_score', type: 'numeric', precision: 7, scale: 4 }) rankingScore!: string;
  @Column({ name: 'global_ranking_score', type: 'numeric', precision: 7, scale: 4 })
  globalRankingScore!: string;
  @Column({ name: 'strategy_rank', type: 'integer' }) strategyRank!: number;
  @Column({ name: 'strategy_qualified_count', type: 'integer' }) strategyQualifiedCount!: number;
  @Column({ name: 'global_rank', type: 'integer' }) globalRank!: number;
  @Column({ name: 'global_qualified_count', type: 'integer' }) globalQualifiedCount!: number;
  @Column({ name: 'technical_snapshot', type: 'jsonb' })
  technicalSnapshot!: TechnicalIndicatorSnapshot;
  @Column({ name: 'strategy_result', type: 'jsonb' }) strategyResult!: StrategyResult;
  @Column({ name: 'ranking_features', type: 'jsonb' }) rankingFeatures!: RankingEvidence;
  @Column({ name: 'is_shortlisted', type: 'boolean', default: false }) isShortlisted!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
