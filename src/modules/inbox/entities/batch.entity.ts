
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
  OneToMany
} from 'typeorm';
import { InboxMessage } from './inbox.entity';
import type { Relation } from 'typeorm';

@Entity('inbox_batches')
export class InboxBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  idempotencyKey: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => InboxMessage, (message) => message.batch)
  messages: Relation<InboxMessage[]>;
}

