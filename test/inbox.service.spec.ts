
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InboxService } from '../src/modules/inbox/services/inbox.service';
import { InboxMessage, MessageStatus } from '../src/modules/inbox/entities/inbox.entity';
import { AuthenticatedUser } from '../src/modules/auth/types/auth.types';
import { Notification } from '../src/modules/notification/entities/notification.entity';

type TestMessage = {
  id: string;
  batchId: string;
  status: MessageStatus;
  version: number;
  sender: string;
  body: string;
  draft: string;
  failureReason: string | null;
  nextRetryAt: Date | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  retryCount: number;
  intent: string;
};

type UpdateResult = { affected: number };

type MockUpdateBuilder = {
  update: jest.Mock<(...args: unknown[]) => MockUpdateBuilder>;
  set: jest.Mock<(...args: unknown[]) => MockUpdateBuilder>;
  where: jest.Mock<(...args: unknown[]) => MockUpdateBuilder>;
  andWhere: jest.Mock<(...args: unknown[]) => MockUpdateBuilder>;
  execute: jest.Mock<() => Promise<UpdateResult>>;
};

type TestRepository = {
  create: (data: TestMessage) => TestMessage;
  save: ReturnType<typeof mockResolved<TestMessage>>;
};


type TestTransactionManager = {
  getRepository: (entity: unknown) => {
    create: (data: any) => any;
    save: (data: any) => Promise<any>;
  };
  createQueryBuilder: () => MockUpdateBuilder;
};

const mockResolved = <T>(value: T) =>
  jest.fn<() => Promise<T>>().mockResolvedValue(value);

const adminUser: AuthenticatedUser = {
  sub: '1',
  email: 'admin@example.com',
  role: 'admin',
};

const candidateUser: AuthenticatedUser = {
  sub: '2',
  email: 'candidate@example.com',
  role: 'candidate',
};

const otherUser = {
  sub: '3',
  email: 'other@example.com',
  role: 'staff',
};

describe('InboxService', () => {
  let service: InboxService;
  let messages: {
    findOneBy: jest.Mock<(criteria: { id: string }) => Promise<TestMessage | null>>;
    findOneByOrFail: jest.Mock<(criteria: { id: string }) => Promise<TestMessage>>;
    update: jest.Mock<(criteria: { id: string }, values: object) => Promise<UpdateResult>>;
    createQueryBuilder: jest.Mock<(...args: unknown[]) => any>;
    find: jest.Mock<(...args: unknown[]) => Promise<TestMessage[]>>;
  };
  let batches: {
    findOneBy: jest.Mock<(criteria: { id: string }) => Promise<{ id: string } | null>>;
    findOne: jest.Mock<(options: object) => Promise<{ id: string } | null>>;
  };
  let redis: {
    get: jest.Mock<(key: string) => Promise<string | null>>;
    set: jest.Mock<(...args: (string | number)[]) => Promise<string | null>>;
    del: jest.Mock<(key: string) => Promise<number>>;
  };
  let updateBuilder: MockUpdateBuilder;
  let notificationRepo: {
    create: jest.Mock<(data: object) => object>;
    save: jest.Mock<(data: object) => Promise<object>>;
  };
  let transaction: jest.Mock<
    <T>(callback: (manager: TestTransactionManager) => Promise<T> | T) => Promise<T>
  >;
  let message: TestMessage;

  beforeEach(() => {
    message = {
      id: 'message-1',
      batchId: 'batch-1',
      status: MessageStatus.DRAFT,
      version: 1,
      sender: 'candidate@example.com',
      body: 'Please review my request',
      draft: 'AI draft response',
      failureReason: 'Previous error',
      nextRetryAt: new Date(),
      leaseToken: 'lease-123',
      leaseExpiresAt: new Date(),
      retryCount: 3,
      intent: 'general',
    };

    messages = {
      findOneBy: jest.fn<(criteria: { id: string }) => Promise<TestMessage | null>>()
        .mockResolvedValue(message),
      findOneByOrFail: jest.fn<(criteria: { id: string }) => Promise<TestMessage>>()
        .mockResolvedValue(message),
      update: mockResolved<UpdateResult>({ affected: 1 }) as typeof messages.update,
      createQueryBuilder: jest.fn(),
      find: mockResolved<TestMessage[]>([message]),
    };

    batches = {
      findOneBy: mockResolved<{ id: string } | null>({ id: 'batch-1' }),
      findOne: mockResolved<{ id: string } | null>({ id: 'batch-1' }),
    };

    redis = {
      get: mockResolved<string | null>(null),
      set: mockResolved<string | null>('OK'),
      del: mockResolved<number>(1),
    };

    updateBuilder = {
      update: jest.fn(),
      set: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      execute: mockResolved<UpdateResult>({ affected: 1 }),
    };

    updateBuilder.update.mockReturnValue(updateBuilder);
    updateBuilder.set.mockReturnValue(updateBuilder);
    updateBuilder.where.mockReturnValue(updateBuilder);
    updateBuilder.andWhere.mockReturnValue(updateBuilder);

    messages.createQueryBuilder.mockReturnValue(updateBuilder);

    notificationRepo = {
      create: jest.fn((data: object) => data),
      save: mockResolved<object>({ id: 'notification-1' }),
    };

    const repository = {
      create: jest.fn((data: any) => data),
      save: mockResolved<TestMessage>(message),
    };

    const manager: TestTransactionManager = {
      getRepository: (entity: unknown) => {
        if (entity === Notification) {
          return notificationRepo;
        }

        return repository;
      },
      createQueryBuilder: () => updateBuilder,
    };

    transaction = jest.fn(
      async <T>(callback: (manager: TestTransactionManager) => Promise<T> | T) =>
        callback(manager),
    );

    service = Object.create(InboxService.prototype) as InboxService;

    Object.assign(service, {
      messages,
      batches,
      dataSource: { transaction },
      redis,
    });
  });

  describe('reviewMessage - concurrency', () => {
    it('rejects stale versions before writing', async () => {
      updateBuilder.execute.mockResolvedValue({ affected: 0 });

      await expect(
        service.reviewMessage('message-1', adminUser, 'approve', 0),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a concurrent reviewer when the conditional update loses', async () => {
      updateBuilder.execute.mockResolvedValue({ affected: 0 });

      await expect(
        service.reviewMessage('message-1', adminUser, 'approve', 1),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('uses the expected version in the SQL update', async () => {
      await service.reviewMessage('message-1', adminUser, 'approve', 1);

      expect(updateBuilder.andWhere).toHaveBeenCalledWith(
        '"version" = :version',
        { version: 1 },
      );
    });

    it('increments the version atomically in SQL', async () => {
      await service.reviewMessage('message-1', adminUser, 'approve', 1);

      const update = updateBuilder.set.mock.calls[0]?.[0] as {
        version: () => string;
      };

      expect(update.version()).toBe('"version" + 1');
    });
  });

  describe('reviewMessage - authorization and outcomes', () => {
    it('rejects reviewers who are not admins', async () => {
      await expect(
        service.reviewMessage('message-1', candidateUser, 'approve', 1),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(messages.findOneBy).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the message does not exist', async () => {
      messages.findOneBy.mockResolvedValue(null);

      await expect(
        service.reviewMessage('missing', adminUser, 'approve', 1),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(transaction).not.toHaveBeenCalled();
    });

    it('approves a draft and creates a notification', async () => {
      const result = await service.reviewMessage(
        'message-1',
        adminUser,
        'approve',
        1,
      );

      expect(notificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Update regarding your inbox message',
          recipientEmail: message.sender,
        }),
      );

      expect(notificationRepo.save).toHaveBeenCalled();
      expect(updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: MessageStatus.APPROVED,
          version: expect.any(Function),
        }),
      );
      expect(redis.del).toHaveBeenCalledWith('message:message-1');
      expect(result).toBe(message);
    });

    it('rejects a draft without creating a notification', async () => {
      await service.reviewMessage('message-1', adminUser, 'reject', 1);

      expect(notificationRepo.create).not.toHaveBeenCalled();
      expect(notificationRepo.save).not.toHaveBeenCalled();
      expect(updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: MessageStatus.REJECTED }),
      );
    });

    it('throws ConflictException if the conditional update loses', async () => {
      updateBuilder.execute.mockResolvedValue({ affected: 0 });

      await expect(
        service.reviewMessage('message-1', adminUser, 'approve', 1),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('regenerate', () => {
    it('throws NotFoundException when the message does not exist', async () => {
      messages.findOneBy.mockResolvedValue(null);

      await expect(service.regenerate('missing'))
        .rejects.toBeInstanceOf(NotFoundException);

      expect(messages.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException if another worker claims the retry', async () => {
      messages.update.mockResolvedValue({ affected: 0 });

      await expect(service.regenerate('message-1'))
        .rejects.toBeInstanceOf(ConflictException);

      expect(messages.findOneByOrFail).not.toHaveBeenCalled();
    });

    it('resets retry fields and invalidates the message cache', async () => {
      await service.regenerate('message-1');

      expect(messages.update).toHaveBeenCalledWith(
        { id: 'message-1' },
        {
          status: MessageStatus.PENDING,
          failureReason: null,
          draft: '',
          intent: '',
          retryCount: 0,
        },
      );

      expect(redis.del).toHaveBeenCalledWith('message:message-1');
      expect(messages.findOneByOrFail).toHaveBeenCalledWith({
        id: 'message-1',
      });
    });
  });

  describe('createBatch', () => {
    it('rejects an empty idempotency key', async () => {
      await expect(
        service.createBatch(adminUser, { key: '', messages: [] }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects an idempotency key longer than 128 characters', async () => {
      await expect(
        service.createBatch(adminUser, {
          key: 'k'.repeat(129),
          messages: [],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('createCandidateMessage', () => {
    it('rejects users who are not candidates', async () => {
      await expect(
        service.createCandidateMessage(adminUser, { body: 'Hello' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a whitespace-only message', async () => {
      await expect(
        service.createCandidateMessage(candidateUser, { body: '   ' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('list', () => {
    it('throws NotFoundException when the batch does not exist', async () => {
      batches.findOneBy.mockResolvedValue(null);

      await expect(service.list('missing-batch'))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns cached data without querying the database', async () => {
      const cached = [{ id: 'cached-message' }];
      redis.get.mockResolvedValue(JSON.stringify(cached));

      await expect(service.list('batch-1')).resolves.toEqual(cached);
      expect(batches.findOneBy).not.toHaveBeenCalled();
    });
  });

  describe('listMessages', () => {
    const createListQuery = (items: TestMessage[] = [], total = 0) => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: mockResolved<[TestMessage[], number]>([items, total]),
    });

    it('rejects an unauthorized role when the cache is empty', async () => {
      const query = createListQuery();
      messages.createQueryBuilder.mockReturnValue(query);

      await expect(
        service.listMessages(otherUser as any, { page: 1, limit: 10 }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(query.getManyAndCount).not.toHaveBeenCalled();
    });

    it('filters candidate messages by email, case-insensitively', async () => {
      const query = createListQuery([message], 1);
      messages.createQueryBuilder.mockReturnValue(query);

      await service.listMessages(candidateUser, { page: 1, limit: 10 });

      expect(query.where).toHaveBeenCalledWith(
        'LOWER(message.sender) = LOWER(:email)',
        { email: candidateUser.email },
      );
    });

    it('clamps page and limit to valid bounds', async () => {
      const query = createListQuery();
      messages.createQueryBuilder.mockReturnValue(query);

      const result = await service.listMessages(adminUser, {
        page: -5,
        limit: 500,
      });

      expect(query.skip).toHaveBeenCalledWith(0);
      expect(query.take).toHaveBeenCalledWith(100);
      expect(result).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 100,
        totalPages: 0,
      });
    });

    
    it('returns cached list results without querying the database', async () => {
      const cached = {
        items: [{ id: 'cached-message' }],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      jest.spyOn(service as any, 'readFromCache').mockResolvedValue(JSON.stringify(cached));

      await expect(service.listMessages(adminUser, { page: 1, limit: 10 })).resolves.toEqual(cached);

      expect(messages.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
