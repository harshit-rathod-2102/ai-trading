import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('universes')
export class Universe {
  @PrimaryColumn({ type: 'varchar', length: 32 }) code!: string;
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
