import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { MarketRegimeComponents } from '../models/market-regime-components.model';
import { MarketRegime, RegimeConfidence } from '../models/market-regime.enum';

@Entity('market_regime_snapshots')
export class MarketRegimeSnapshot {
  @PrimaryColumn('uuid') id!: string;

  @Column({ name: 'market_date', type: 'date' }) marketDate!: string;

  @Column({ type: 'varchar', length: 16 }) regime!: MarketRegime;

  @Column({ type: 'numeric', precision: 7, scale: 4 }) score!: string;

  @Column({ type: 'varchar', length: 8 }) confidence!: RegimeConfidence;

  @Column({ type: 'varchar', length: 64 }) version!: string;

  @Column({ name: 'universe_code', type: 'varchar', length: 32 }) universeCode!: string;

  @Column({ type: 'jsonb' }) components!: MarketRegimeComponents;

  @Column({ type: 'jsonb' }) reasons!: string[];

  @Column({ type: 'jsonb' }) warnings!: string[];

  @Column({ name: 'calculated_at', type: 'timestamptz' }) calculatedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
