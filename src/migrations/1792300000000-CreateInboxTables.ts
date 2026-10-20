
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInboxTables1792300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create the PostgreSQL enum.
    await queryRunner.query(`
      CREATE TYPE "public"."inbox_messages_status_enum"
      AS ENUM ('PENDING', 'PROCESSING', 'FAILED');
    `);

    // 2. Create inbox_batches.
    await queryRunner.query(`
      CREATE TABLE "inbox_batches" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "idempotencyKey" varchar(128) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inbox_batches_id" PRIMARY KEY ("id")
      );
    `);

    // 3. Create inbox_messages.
    await queryRunner.query(`
      CREATE TABLE "inbox_messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "batchId" uuid NOT NULL,
        "sender" varchar(320) NOT NULL,
        "body" text NOT NULL,
        "intent" varchar(80) NULL,
        "draft" text NULL,
        "status" "public"."inbox_messages_status_enum" NOT NULL DEFAULT 'PENDING',
        "failureReason" text NULL,
        "version" integer NOT NULL DEFAULT 1,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "retryCount" integer NOT NULL DEFAULT 0,
        "nextRetryAt" timestamptz NULL,
        "leaseToken" uuid NULL,
        "leaseExpiresAt" timestamptz NULL,
        "reviewedBy" varchar(100) NULL,
        "reviewedAt" timestamp NULL,
        CONSTRAINT "PK_inbox_messages_id"
          PRIMARY KEY ("id"),
        CONSTRAINT "FK_inbox_messages_batchId"
          FOREIGN KEY ("batchId")
          REFERENCES "inbox_batches" ("id")
          ON DELETE CASCADE
      );
    `);

    // 4. Unique idempotency key.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_inbox_batches_idempotencyKey"
      ON "inbox_batches" ("idempotencyKey");
    `);

    // 5. Batch lookup index.
    await queryRunner.query(`
      CREATE INDEX "IDX_inbox_messages_batchId_createdAt"
      ON "inbox_messages" ("batchId", "createdAt");
    `);

    // 6. Failed-message retry index.
    await queryRunner.query(`
      CREATE INDEX "idx_inbox_messages_retry_ready"
      ON "inbox_messages" ("nextRetryAt", "createdAt")
      WHERE "status" = 'FAILED';
    `);

    // 7. Expired-lease lookup index.
    await queryRunner.query(`
      CREATE INDEX "idx_inbox_messages_expired_lease"
      ON "inbox_messages" ("leaseExpiresAt", "createdAt")
      WHERE "status" = 'PROCESSING'
        AND "leaseExpiresAt" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dropping the tables also removes their indexes and FK.
    await queryRunner.query(`
      DROP TABLE IF EXISTS "inbox_messages";
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "inbox_batches";
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."inbox_messages_status_enum";
    `);
  }
}

