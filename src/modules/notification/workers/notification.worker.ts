// notification.worker.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { NotificationStatus } from './../entities/notification.entity';
import { BrevoService } from './../services/brevo.service';

@Injectable()
export class NotificationWorker {
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(
    private dataSource: DataSource,
    private brevoService: BrevoService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCron() {
    try {
      await this.processBatch();
    } catch (error: any) {
      this.logger.error(`Error in notification worker loop: ${error.message}`, error.stack);
    }
  }

  private async processBatch() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const [notifications, count] = await queryRunner.manager.query(
        `
        WITH locked_rows AS (
          SELECT id
          FROM "notifications"
          WHERE status = $1 AND attempts < $2
          ORDER BY "createdAt" ASC
          LIMIT 10
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "notifications"
        SET status = $3, "updatedAt" = CURRENT_TIMESTAMP
        FROM locked_rows
        WHERE "notifications".id = locked_rows.id
        RETURNING "notifications".*;
        `,
        [NotificationStatus.PENDING, 5, NotificationStatus.PROCESSING],
      );

      await queryRunner.commitTransaction();
      if (count === 0) {
        return;
      }
      this.logger.log(`Claimed ${count} notification(s) for processing.`);

      for (const notification of notifications) {
        try {
          await this.brevoService.sendEmail(
            notification.recipientEmail,
            notification.subject,
            notification.content,
          );

          await this.dataSource.manager.query(
            `UPDATE "notifications" SET status = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
            [NotificationStatus.SENT, notification.id],
          );
        } catch (error: any) {
          this.logger.warn(`Failed to send notification ${notification.id}: ${error.message}`);
          
          const newAttempts = notification.attempts + 1;
          const nextStatus = newAttempts >= 5 ? NotificationStatus.FAILED : NotificationStatus.PENDING;

          await this.dataSource.manager.query(
            `UPDATE "notifications" SET status = $1, attempts = $2, "lastError" = $3, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $4`,
            [nextStatus, newAttempts, error.message, notification.id],
          );
        }
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}