import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Instrument } from '../../instruments/entities/instrument.entity';

@Entity('daily_candles')
export class DailyCandle {
  @PrimaryColumn('uuid') id!: string;

  @Column({ name: 'instrument_id', type: 'uuid' }) instrumentId!: string;

  @ManyToOne(() => Instrument, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'instrument_id' })
  instrument!: Instrument;

  @Column({ name: 'session_date', type: 'date' }) sessionDate!: string;

  @Column({ type: 'numeric', precision: 18, scale: 4 }) open!: string;

  @Column({ type: 'numeric', precision: 18, scale: 4 }) high!: string;

  @Column({ type: 'numeric', precision: 18, scale: 4 }) low!: string;

  @Column({ type: 'numeric', precision: 18, scale: 4 }) close!: string;

  @Column({ type: 'numeric', precision: 20, scale: 0, nullable: true }) volume!: string | null;

  @Column({ type: 'varchar', length: 64 }) provider!: string;

  @Column({ name: 'is_synthetic', type: 'boolean' }) isSynthetic!: boolean;

  @Column({ name: 'adjustment_basis', type: 'varchar', length: 32 }) adjustmentBasis!: string;

  @Column({ name: 'fetched_at', type: 'timestamptz' }) fetchedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
