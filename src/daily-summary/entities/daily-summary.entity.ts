import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { DailySummarySnapshot } from '../models/daily-summary.model';

export enum DailySummaryStatus {
  GENERATED = 'GENERATED',
  SENDING = 'SENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

@Entity('daily_summaries')
export class DailySummaryRecord {
  @PrimaryColumn('uuid') id!: string;

  @Column({ name: 'market_date', type: 'date' }) marketDate!: string;

  @Column({ type: 'varchar', length: 64 }) version!: string;

  @Column({ type: 'varchar', length: 16 }) status!: DailySummaryStatus;

  @Column({ name: 'summary_snapshot', type: 'jsonb' }) summarySnapshot!: DailySummarySnapshot;

  @Column({ name: 'message_text', type: 'text' }) messageText!: string;

  @Column({ type: 'varchar', length: 64, nullable: true }) provider!: string | null;

  @Column({ name: 'provider_message_id', type: 'varchar', length: 255, nullable: true })
  providerMessageId!: string | null;

  @Column({ name: 'delivery_attempts', type: 'integer', default: 0 }) deliveryAttempts!: number;

  @Column({ name: 'generated_at', type: 'timestamptz' }) generatedAt!: Date;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true }) sentAt!: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true }) errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
