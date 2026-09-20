import { Column, CreateDateColumn, Entity, PrimaryColumn, JoinColumn, ManyToOne } from 'typeorm';
import { EventSource } from '../../common/enums/event-source.enum';
import { TradeEventType } from '../../common/enums/trade-event-type.enum';
import { Trade } from '../../trades/entities/trade.entity';
import { TradeCandidate } from '../../candidates/entities/trade-candidate.entity';

@Entity('trade_events')
export class TradeEvent {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'trade_id', type: 'uuid', nullable: true })
  tradeId!: string | null;

  @ManyToOne(() => Trade, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'trade_id' })
  trade!: Trade | null;

  @Column({ name: 'candidate_id', type: 'uuid', nullable: true })
  candidateId!: string | null;

  @ManyToOne(() => TradeCandidate, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'candidate_id' })
  candidate!: TradeCandidate | null;

  @Column({ name: 'event_type', type: 'varchar', length: 32 })
  eventType!: TradeEventType;

  @Column({ name: 'source', type: 'varchar', length: 16 })
  source!: EventSource;

  @Column({ name: 'price', type: 'numeric', precision: 18, scale: 4, nullable: true })
  price!: string | null;

  @Column({ name: 'quantity', type: 'integer', nullable: true })
  quantity!: number | null;

  @Column({ name: 'data', type: 'jsonb', nullable: true })
  data!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'clock_timestamp()' })
  createdAt!: Date;
}
