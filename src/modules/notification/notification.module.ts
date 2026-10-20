import { Module } from '@nestjs/common';
import { BrevoService } from './services/brevo.service';
import { NotificationWorker } from './workers/notification.worker';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  providers: [BrevoService, NotificationWorker],
  controllers: [],
  exports: [BrevoService]
})
export class NotificationModule {}
