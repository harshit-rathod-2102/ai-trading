import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { InstrumentType } from '../../common/enums/instrument-type.enum';

@Entity('instruments')
export class Instrument {
  @PrimaryColumn('uuid') id!: string;

  @Column({ type: 'varchar', length: 32 }) symbol!: string;

  @Column({ type: 'varchar', length: 16 }) exchange!: string;

  @Column({ type: 'varchar', length: 160 }) name!: string;

  @Column({ type: 'varchar', length: 16 }) type!: InstrumentType;

  @Column({ type: 'varchar', length: 100, nullable: true }) sector!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true }) industry!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true }) provider!: string | null;

  @Column({ name: 'provider_instrument_id', type: 'varchar', length: 160, nullable: true })
  providerInstrumentId!: string | null;

  @Column({ name: 'provider_symbol', type: 'varchar', length: 160, nullable: true })
  providerSymbol!: string | null;

  @Column({ name: 'provider_metadata', type: 'jsonb', nullable: true })
  providerMetadata!: Record<string, string | number | boolean | null> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
