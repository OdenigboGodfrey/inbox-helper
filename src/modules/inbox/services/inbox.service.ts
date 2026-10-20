
import {
    Injectable, ConflictException, NotFoundException,
    UnprocessableEntityException,
    ForbiddenException,
    Logger
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { InboxBatch } from '../entities/batch.entity';
import { InboxMessage, MessageStatus } from '../entities/inbox.entity';
import { CandidateMessageDto, CreateBatchDto, CreateMessageDto, ListMessagesDto } from '../dtos/dto';
import { AuthenticatedUser } from '../../auth/types/auth.types';
import { Notification } from '../../notification/entities/notification.entity';



@Injectable()
export class InboxService {
    private readonly redis: Redis;
    private readonly logger = new Logger(InboxService.name);

    constructor(
        private readonly dataSource: DataSource,
        @InjectRepository(InboxBatch)
        private readonly batches: Repository<InboxBatch>,
        @InjectRepository(InboxMessage)
        private readonly messages: Repository<InboxMessage>,
    ) {
        this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
            maxRetriesPerRequest: 2,
            enableOfflineQueue: false,
            lazyConnect: true
        });
        void this.redis.connect().catch(() => undefined);
    }

    async createBatch(user: AuthenticatedUser, dto: CreateBatchDto) {
        if (!dto.key || dto.key.length > 128) {
            throw new UnprocessableEntityException(
                'A valid request-Key header with a max of 128 chars is required'
            );
        }

        let batch: InboxBatch;
        let savedMessages: InboxMessage[] = [];

        try {
            batch = await this.dataSource.transaction(async manager => {
                const repo = manager.getRepository(InboxBatch);
                const createBatch = repo.create({ idempotencyKey: dto.key });
                const created = await repo.save(createBatch);

                const messageRepo = manager.getRepository(InboxMessage);
                const inboxMessages = dto.messages.map(message => {
                    const insert = messageRepo.create({
                        batchId: created.id,
                        sender: user.email,
                        body: message.body,
                        status: MessageStatus.PENDING,
                        retryCount: 0,
                        version: 1,
                    });
                    return insert;
                });
                
                savedMessages = await messageRepo.save(inboxMessages);

                return created;
            });
        } catch (error) {
            this.logger.error('[Error] create Batch', JSON.stringify(error));
            const existing = await this.batches.findOne({
                where: { idempotencyKey: dto.key }
            });

            if (!existing) throw error;
            batch = existing;

            savedMessages = await this.messages.find({
                where: { batchId: batch.id },
                order: { createdAt: 'ASC' }
            });
        }


        return {
            batchId: batch.id,
            messages: savedMessages
        };
    }

    async list(batchId: string) {
        const cacheKey = `inbox:batch:${batchId}`;
        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch { }

        const batch = await this.batches.findOneBy({ id: batchId });
        if (!batch) throw new NotFoundException('Batch not found');

        const messages = await this.messages.find({
            where: { batchId },
            order: { createdAt: 'ASC' }
        });

        try {
            this.writeToCache({ key: cacheKey, data: JSON.stringify(messages), ttlSeconds: Number(process.env.CACHE_TTL_SECONDS || 30) })
        } catch { }

        return messages;
    }

    async regenerate(id: string) {
        const message = await this.messages.findOneBy({ id });
        if (!message) throw new NotFoundException('Message not found');

        const claim = await this.messages.update(
            { id },
            {
                status: MessageStatus.PENDING,
                failureReason: null,
                draft: '',
                intent: '',
                retryCount: 0,
            }
        );

        if (claim.affected !== 1) {
            throw new ConflictException('Retry was claimed by another worker');
        }

        await this.invalidateCache({key: `message:${message.id}`});

        return this.messages.findOneByOrFail({ id });
    }

    async createCandidateMessage(
        user: AuthenticatedUser,
        dto: CreateMessageDto,
    ) {
        if (user.role !== 'candidate') {
            throw new ForbiddenException('Only candidates can submit messages');
        }

        const body = dto.body.trim();

        if (!body) {
            throw new ConflictException('Message cannot be empty');
        }

        return await await this.createBatch(user,
            {
                key: randomUUID().toString(),
                messages: [
                    new CandidateMessageDto({
                        body,
                        sender: user.email,
                    })
                ],
            });
    }

    async listMessages(
        user: AuthenticatedUser,
        pagination: ListMessagesDto,
    ) {
        if (user.role !== 'candidate' && user.role !== 'admin') {
            throw new ForbiddenException();
        }
        
        const cacheKey = `messages:list:${pagination.page}:${pagination.limit}`;
        try {
            const cached = await this.readFromCache({ key: cacheKey });
            if (cached) return JSON.parse(cached);
        } catch { }

        const page = Math.max(1, pagination.page || 1);
        const limit = Math.min(100, Math.max(1, pagination.limit || 10));

        const query = this.messages.createQueryBuilder('message');

        if (user.role === 'candidate') {
            query.where('LOWER(message.sender) = LOWER(:email)', {
                email: user.email,
            });
        } else if (user.role !== 'admin') {
            throw new ForbiddenException();
        }

        query.orderBy('message.createdAt', 'DESC')
            .addOrderBy('message.id', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        const [items, total] = await query.getManyAndCount();
        const response = {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };

        await this.writeToCache({ key: cacheKey, ttlSeconds: 300, data: response });

        return response
    }

    async reviewMessage(
        id: string,
        user: AuthenticatedUser,
        action: 'approve' | 'reject',
        expectedVersion: number,
    ) {
        if (user.role !== 'admin') {
            throw new ForbiddenException();
        }

        const message = await this.messages.findOneBy({ id });
        if (!message) {
            throw new NotFoundException('Message not found');
        }

        const status = action === 'approve' ? MessageStatus.APPROVED : MessageStatus.REJECTED;

        await this.dataSource.transaction(async (manager) => {
            // Create notification only if approved
            if (action === 'approve') {
                const notificationRepo = manager.getRepository(Notification);
                const notification = notificationRepo.create({
                    subject: 'Update regarding your inbox message',
                    content: `
                    <p>Your request has been reviewed and a response has been provided, please see below.</p>
                    <p>Candidate: ${message.body}</p>
                    <p>Staff: ${message.draft}</p>
                `,
                    recipientEmail: message.sender,
                });
                await notificationRepo.save(notification);
            }

            // Shared InboxMessage update logic
            const inboxMessageUpdate = await manager.createQueryBuilder()
                .update(InboxMessage)
                .set({
                    status,
                    failureReason: null,
                    nextRetryAt: null,
                    leaseToken: null,
                    leaseExpiresAt: null,
                    version: () => '"version" + 1',
                })
                .where('"id" = :id', { id })
                .andWhere('"status" = :draft', { draft: MessageStatus.DRAFT })
                .andWhere('"version" = :version', { version: expectedVersion })
                .execute();

            if (inboxMessageUpdate.affected !== 1) {
                throw new ConflictException(
                    'This draft has changed or is no longer awaiting review',
                );
            }
        });

        await this.invalidateCache({ key: `message:${id}` });

        return message;
    }

    private async invalidateCache(payload: { key: string }) {
        try {
            if (payload?.key) {
                await this.redis.del(payload.key);
            }
        } catch { }
    }

    private async writeToCache(payload: { key: string; data: any; ttlSeconds?: number }) {
        try {
            const serialized = JSON.stringify(payload.data);
            if (payload.ttlSeconds) {
                await this.redis.set(payload.key, serialized, 'EX', payload.ttlSeconds);
            } else {
                await this.redis.set(payload.key, serialized);
            }
        } catch { }
    }

    private async readFromCache(payload: { key: string }) {
        try {
            const data = await this.redis.get(payload.key);
            return data ? JSON.parse(data) : null;
        } catch {
            return null;
        }
    }


}
