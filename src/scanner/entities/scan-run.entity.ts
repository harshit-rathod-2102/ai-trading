import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { MarketRegimeResult } from '../../market-regime/models/market-regime-result.model';
import { ScanExclusion } from '../models/scan-result.model';
import { ScanStatus } from '../models/scan-status.enum';

@Entity('scan_runs')
export class ScanRun {
  @PrimaryColumn('uuid') id!: string;

  @Column({ name: 'market_date', type: 'date' }) marketDate!: string;

  @Column({ name: 'scanner_version', type: 'varchar', length: 64 }) scannerVersion!: string;

  @Column({ name: 'universe_code', type: 'varchar', length: 32 }) universeCode!: string;

  @Column({ name: 'execution_key', type: 'varchar', length: 255 }) executionKey!: string;

  @Column({ type: 'varchar', length: 16 }) status!: ScanStatus;

  @Column({ name: 'market_regime_snapshot', type: 'jsonb', nullable: true })
  marketRegimeSnapshot!: MarketRegimeResult | null;

  @Column({ name: 'total_universe', type: 'integer', default: 0 }) totalUniverse!: number;

  @Column({ name: 'eligible_universe', type: 'integer', default: 0 }) eligibleUniverse!: number;

  @Column({ name: 'excluded_inactive', type: 'integer', default: 0 }) excludedInactive!: number;

  @Column({ name: 'excluded_insufficient_history', type: 'integer', default: 0 })
  excludedInsufficientHistory!: number;

  @Column({ name: 'excluded_invalid_data', type: 'integer', default: 0 })
  excludedInvalidData!: number;

  @Column({ name: 'evaluated_symbols', type: 'integer', default: 0 }) evaluatedSymbols!: number;

  @Column({ name: 'qualified_setups', type: 'integer', default: 0 }) qualifiedSetups!: number;

  @Column({ name: 'shortlisted_setups', type: 'integer', default: 0 }) shortlistedSetups!: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) exclusions!: ScanExclusion[];

  @Column({ name: 'started_at', type: 'timestamptz' }) startedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true }) errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
