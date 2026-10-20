
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InboxController } from './controllers/inbox.controller';
import { InboxService } from './services/inbox.service';
import { AiDrafterService } from './services/ai-drafter.service';
import { InboxMessage } from './entities/inbox.entity';
import { InboxBatch } from './entities/batch.entity';
import { InboxWorker } from './workers/inbox.worker';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([InboxMessage, InboxBatch]),
    NotificationModule,
  ],
  controllers: [InboxController],
  providers: [InboxService, AiDrafterService, InboxWorker]
})
export class InboxModule {}
