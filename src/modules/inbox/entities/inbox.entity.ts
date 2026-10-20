
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Index, VersionColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { InboxBatch } from './batch.entity';
import type { Relation } from 'typeorm';

export enum MessageStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED'
}

@Entity('inbox_messages')
@Index(['batchId', 'createdAt'])
export class InboxMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  batchId: string;

  @ManyToOne(() => InboxBatch, (batch) => batch.messages, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'batchId', referencedColumnName: 'id' })
  batch: Relation<InboxBatch>;
  // batch: InboxBatch;

  @Column({ type: 'varchar', length: 320 })
  sender: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  intent: string | null;

  @Column({ type: 'text', nullable: true })
  draft: string | null;

  @Column({
    type: 'enum',
    enum: MessageStatus,
    default: MessageStatus.PENDING
  })
  status: MessageStatus;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'integer', default: 0 })
  retryCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  nextRetryAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  leaseToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  leaseExpiresAt: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reviewedBy: string;

  @Column({
    type: 'timestamp',
    default: () => 'NOW()',
    nullable: true
  })
  reviewedAt: Date;
}

