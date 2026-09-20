import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Instrument } from './instrument.entity';
import { Universe } from './universe.entity';

@Entity('universe_memberships')
export class UniverseMembership {
  @PrimaryColumn({ name: 'universe_code', type: 'varchar', length: 32 }) universeCode!: string;

  @PrimaryColumn({ name: 'instrument_id', type: 'uuid' }) instrumentId!: string;

  @ManyToOne(() => Universe, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'universe_code' })
  universe!: Universe;

  @ManyToOne(() => Instrument, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'instrument_id' })
  instrument!: Instrument;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
