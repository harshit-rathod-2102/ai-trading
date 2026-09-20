import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { DailyPipelineStatus, JobTriggerSource } from '../models/job-data.model';

@Entity('daily_pipeline_runs')
export class DailyPipelineRun {
  @PrimaryColumn('uuid') id!: string;
  @Column({ name: 'market_date', type: 'date' }) marketDate!: string;
  @Column({ type: 'varchar', length: 64 }) version!: string;
  @Column({ type: 'varchar', length: 16 }) status!: DailyPipelineStatus;
  @Column({ name: 'trigger_source', type: 'varchar', length: 16 }) triggerSource!: JobTriggerSource;
  @Column({ name: 'started_at', type: 'timestamptz' }) startedAt!: Date;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @Column({ name: 'market_data_status', type: 'varchar', length: 32, default: 'PENDING' })
  marketDataStatus!: string;
  @Column({ name: 'scanner_run_id', type: 'uuid', nullable: true }) scannerRunId!: string | null;
  @Column({ name: 'candidates_created', type: 'integer', default: 0 }) candidatesCreated!: number;
  @Column({ name: 'candidates_risk_rejected', type: 'integer', default: 0 })
  candidatesRiskRejected!: number;
  @Column({ name: 'candidates_total', type: 'integer', default: 0 }) candidatesTotal!: number;
  @Column({ name: 'candidates_processed', type: 'integer', default: 0 })
  candidatesProcessed!: number;
  @Column({ name: 'candidate_analysis_failures', type: 'integer', default: 0 })
  candidateAnalysisFailures!: number;
  @Column({ name: 'news_enriched', type: 'integer', default: 0 }) newsEnriched!: number;
  @Column({ name: 'fast_analyzed', type: 'integer', default: 0 }) fastAnalyzed!: number;
  @Column({ name: 'deep_analyzed', type: 'integer', default: 0 }) deepAnalyzed!: number;
  @Column({ type: 'integer', default: 0 }) qualified!: number;
  @Column({ name: 'wait_count', type: 'integer', default: 0 }) waitCount!: number;
  @Column({ type: 'integer', default: 0 }) rejected!: number;
  @Column({ type: 'integer', default: 0 }) notified!: number;
  @Column({ name: 'news_failures', type: 'integer', default: 0 }) newsFailures!: number;
  @Column({ name: 'ai_failures', type: 'integer', default: 0 }) aiFailures!: number;
  @Column({ name: 'notification_failures', type: 'integer', default: 0 })
  notificationFailures!: number;
  @Column({ name: 'error_message', type: 'text', nullable: true }) errorMessage!: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata!: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
