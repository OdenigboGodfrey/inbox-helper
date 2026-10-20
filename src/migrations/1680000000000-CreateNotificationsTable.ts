import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsTable1680000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "recipientEmail" VARCHAR NOT NULL,
        "subject" VARCHAR NOT NULL,
        "content" TEXT NOT NULL,
        "status" VARCHAR NOT NULL DEFAULT 'PENDING',
        "attempts" INT NOT NULL DEFAULT 0,
        "lastError" TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_NOTIFICATIONS_WORKER_POLL" 
      ON "notifications" ("status", "attempts", "createdAt");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_NOTIFICATIONS_WORKER_POLL";
    `);
    
    await queryRunner.query(`
      DROP TABLE IF EXISTS "notifications";
    `);
  }
}