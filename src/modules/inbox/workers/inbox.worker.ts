
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { AiDrafterService } from '../services/ai-drafter.service';
import { InboxMessage, MessageStatus } from '../entities/inbox.entity';

interface ClaimedMessage {
  id: string;
  batchId: string;
  sender: string;
  body: string;
  leaseToken: string;
  retryCount: number;
  status: MessageStatus;
}

@Injectable()
export class InboxWorker {
  private readonly logger = new Logger(InboxWorker.name);

  private readonly maxRetries = Math.max(0, Number(process.env.INBOX_MAX_RETRIES ?? 5));
  private readonly batchSize = 1;
  private readonly leaseMs = Math.max(5000, Number(process.env.INBOX_WORKER_LEASE_MS ?? 60000));
  private readonly baseDelayMs = Math.max(100, Number(process.env.INBOX_RETRY_BASE_DELAY_MS ?? 5000));
  private readonly maxDelayMs = Math.max(this.baseDelayMs,Number(process.env.INBOX_RETRY_MAX_DELAY_MS ?? 300000));
  private activeCron: boolean = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly ai: AiDrafterService,
  ) {}

  @Cron(process.env.INBOX_RETRY_CRON || '*/10 * * * * *')
  async poll(): Promise<void> {
    if (this.activeCron) return;
    
    const claimed = await this.claimBatch();
    if (claimed.length === 0) return;

    this.logger.log(`Claimed ${claimed.length} message item(s)`);
    this.activeCron = true;

    for(let i = 0; i < claimed.length; i++) {
      const message = claimed[i];
      try {
        await this.process(message);
      }
      catch(error){
        this.logger.error(`Poll Error ${message.id}`);
      }
    }
    this.activeCron = false;
  }

  private async claimBatch(): Promise<ClaimedMessage[]> {
    return this.dataSource.transaction(async manager => {
      const maxAttempts = this.maxRetries;

      // AND "leaseExpiresAt" <= NOW()
      const [rows, affectedCount]: [
        Array<{
          id: string;
          batchId: string;
          sender: string;
          body: string;
          leaseToken: string;
          retryCount: number;
          status: MessageStatus;
        }>,
        number] = await manager.query(
          `
          WITH candidates AS (
            SELECT id
            FROM inbox_messages
            WHERE (status = $1 AND "retryCount" < $2 AND COALESCE("nextRetryAt", NOW()) <= NOW())
            OR (status = $3 AND "leaseExpiresAt" IS NOT NULL  AND "retryCount" < $2)
            OR (status = $6 AND "retryCount" = 0)
            ORDER BY COALESCE("nextRetryAt", "leaseExpiresAt", "createdAt"), "createdAt" FOR UPDATE SKIP LOCKED
            LIMIT $4
        )
        UPDATE inbox_messages AS m
        SET
            status = $3, "retryCount" = m."retryCount" + 1, "leaseToken" = gen_random_uuid(),
            "leaseExpiresAt" = NOW() + ($5 * INTERVAL '1 millisecond'), "nextRetryAt" = NULL, "updatedAt" = NOW(), 
            version = m.version + 1
        FROM candidates AS c
        WHERE m.id = c.id
        RETURNING
            m.id,
            m."batchId" AS "batchId",
            m.sender,
            m.body,
            m.status,
            m."leaseToken" AS "leaseToken",
            m."retryCount" AS "retryCount";
        `,
          [
            MessageStatus.FAILED,
            maxAttempts,
            MessageStatus.PROCESSING,
            this.batchSize,
            this.leaseMs,
            MessageStatus.PENDING,
          ]
        );

      return rows;
    });
  }


  private async process(message: ClaimedMessage) {
    try {
      this.logger.log(`Generating response for message ${message.id} with status ${message.status}`);
      const draft = await this.ai.draft(message.sender, message.body);
      this.logger.log(`Generated response for message ${message.id}`);

      const result = await this.dataSource.createQueryBuilder().update(InboxMessage)
        .set({
          intent: draft.intent,
          draft: draft.reply,
          status: MessageStatus.DRAFT,
          failureReason: null,
          nextRetryAt: null,
          leaseToken: null,
          leaseExpiresAt: null,
          version: () => '"version" + 1'
        })
        .where('"id" = :id', { id: message.id })
        .andWhere('"status" = :status', { status: MessageStatus.PROCESSING })
        .andWhere('"leaseToken" = :token', { token: message.leaseToken })
        .execute();

      if (result.affected !== 1) {
        this.logger.warn(`Discarded stale AI result for message ${message.id}`);
        return;
      }

      this.logger.log(`Response succeeded for message ${message.id}`);
    } catch (error) {
      this.logger.error(error);
      const exhausted = message.retryCount >= this.maxRetries;
      const delay = Math.min(this.baseDelayMs * 2 ** Math.max(0, message.retryCount - 1), this.maxDelayMs);

      await this.dataSource.createQueryBuilder().update(InboxMessage)
        .set({
          status: MessageStatus.FAILED,
          failureReason: exhausted
            ? 'Retry limit exhausted'
            : 'Draft generation failed; retry scheduled',
          nextRetryAt: exhausted ? null : new Date(Date.now() + delay),
          leaseToken: null,
          leaseExpiresAt: null,
          version: () => '"version" + 1'
        })
        .where('"id" = :id', { id: message.id })
        .andWhere('"status" = :status', { status: MessageStatus.PROCESSING })
        .andWhere('"leaseToken" = :token', { token: message.leaseToken })
        .execute();

      this.logger.warn(
        `Retry failed for message ${message.id}; ` +
        `retryCount=${message.retryCount}; exhausted=${exhausted}`
      );
    }
  }
}

