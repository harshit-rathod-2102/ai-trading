import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { PipelineJobSummarySnapshot } from '../models/pipeline-job-summary.model';

export enum PipelineJobSummaryStatus {
  SENDING = 'SENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

@Entity('pipeline_job_summaries')
@Index('uq_pipeline_job_summaries_run_job', ['pipelineRunId', 'jobId'], { unique: true })
export class PipelineJobSummaryRecord {
  @PrimaryColumn('uuid') id!: string;

  @Column({ name: 'pipeline_run_id', type: 'uuid' }) pipelineRunId!: string;

  @Column({ name: 'job_id', type: 'varchar', length: 255 }) jobId!: string;

  @Column({ type: 'varchar', length: 16 }) status!: PipelineJobSummaryStatus;

  @Column({ name: 'summary_snapshot', type: 'jsonb' })
  summarySnapshot!: PipelineJobSummarySnapshot;

  @Column({ name: 'message_text', type: 'text' }) messageText!: string;

  @Column({ name: 'ai_provider', type: 'varchar', length: 64, nullable: true })
  aiProvider!: string | null;

  @Column({ name: 'ai_model', type: 'varchar', length: 255, nullable: true })
  aiModel!: string | null;

  @Column({ name: 'ai_prompt_version', type: 'varchar', length: 64, nullable: true })
  aiPromptVersion!: string | null;

  @Column({ name: 'ai_request_id', type: 'varchar', length: 255, nullable: true })
  aiRequestId!: string | null;

  @Column({ name: 'messaging_provider', type: 'varchar', length: 64, nullable: true })
  messagingProvider!: string | null;

  @Column({ name: 'provider_message_id', type: 'varchar', length: 255, nullable: true })
  providerMessageId!: string | null;

  @Column({ name: 'delivery_attempts', type: 'integer', default: 0 }) deliveryAttempts!: number;

  @Column({ name: 'generated_at', type: 'timestamptz' }) generatedAt!: Date;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true }) sentAt!: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true }) errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
