
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInboxMessageIndexes1792300000000
  implements MigrationInterface
{
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS
        idx_inbox_messages_retry_ready
      ON inbox_messages ("nextRetryAt", "createdAt")
      WHERE status = 'FAILED';
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS
        idx_inbox_messages_expired_lease
      ON inbox_messages ("leaseExpiresAt", "createdAt")
      WHERE status = 'PROCESSING'
        AND "leaseExpiresAt" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX CONCURRENTLY IF EXISTS
        idx_inbox_messages_expired_lease;
    `);

    await queryRunner.query(`
      DROP INDEX CONCURRENTLY IF EXISTS
        idx_inbox_messages_retry_ready;
    `);
  }
}

