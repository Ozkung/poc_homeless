import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TasksService } from '../tasks.service';
import { PrismaService } from '../../../prisma/prisma.service';

// The @nestjs-modules/ioredis @InjectRedis() decorator resolves to this token
// (getRedisConnectionToken() returns `${connection || 'default'}_IORedisModuleConnectionToken`)
const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';

const mockPrisma = {
  eventTask: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  activity: { create: jest.fn() },
};

const mockRedis = {
  setex: jest.fn(),
  getdel: jest.fn(),
};

const mockConfig = {
  get: jest.fn(),
};

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: REDIS_TOKEN, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(TasksService);
    jest.clearAllMocks();
  });

  describe('checkin()', () => {
    it('sets task status to IN_PROGRESS when the requesting user is the assignee', async () => {
      const task = { id: 'task1', assigneeId: 'user1', status: 'PENDING' };
      mockPrisma.eventTask.findUnique.mockResolvedValue(task);
      mockPrisma.eventTask.update.mockResolvedValue({ ...task, status: 'IN_PROGRESS' });

      const result = await service.checkin('task1', 'user1');

      expect(mockPrisma.eventTask.update).toHaveBeenCalledWith({
        where: { id: 'task1' },
        data: { status: 'IN_PROGRESS' },
      });
      expect(result.status).toBe('IN_PROGRESS');
    });

    it('throws NotFoundException when the requesting user is not the task assignee', async () => {
      const task = { id: 'task1', assigneeId: 'user1', status: 'PENDING' };
      mockPrisma.eventTask.findUnique.mockResolvedValue(task);

      await expect(service.checkin('task1', 'wrong-user')).rejects.toThrow(NotFoundException);
      // Should not attempt to update the task
      expect(mockPrisma.eventTask.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when task does not exist', async () => {
      mockPrisma.eventTask.findUnique.mockResolvedValue(null);

      await expect(service.checkin('nonexistent', 'user1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addNote()', () => {
    it('creates an activity record of type NOTE with the given note payload', async () => {
      const task = { id: 'task1', assigneeId: 'user1' };
      const createdActivity = {
        id: 'act1',
        actorId: 'user1',
        taskId: 'task1',
        type: 'NOTE',
        payload: { note: 'Follow-up required' },
      };
      mockPrisma.eventTask.findUnique.mockResolvedValue(task);
      mockPrisma.activity.create.mockResolvedValue(createdActivity);

      const result = await service.addNote('task1', 'user1', 'Follow-up required');

      expect(mockPrisma.activity.create).toHaveBeenCalledWith({
        data: {
          actorId: 'user1',
          taskId: 'task1',
          type: 'NOTE',
          payload: { note: 'Follow-up required' },
        },
      });
      expect(result.type).toBe('NOTE');
      expect((result.payload as any).note).toBe('Follow-up required');
    });

    it('throws NotFoundException when user is not the task assignee', async () => {
      const task = { id: 'task1', assigneeId: 'user1' };
      mockPrisma.eventTask.findUnique.mockResolvedValue(task);

      await expect(service.addNote('task1', 'wrong-user', 'note')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.activity.create).not.toHaveBeenCalled();
    });
  });

  describe('generateLiffToken()', () => {
    it('stores the token in Redis with the configured TTL and persists it to the task row', async () => {
      const ttl = 3600;
      mockConfig.get.mockReturnValue(ttl);
      mockRedis.setex.mockResolvedValue('OK');
      mockPrisma.eventTask.update.mockResolvedValue({ id: 'task1', liffToken: 'sometoken' });

      const token = await service.generateLiffToken('task1');

      // Token should be a 64-character hex string (32 random bytes)
      expect(token).toMatch(/^[0-9a-f]{64}$/);

      // Redis key format: liff:task:{taskId}:{token}
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `liff:task:task1:${token}`,
        ttl,
        '1',
      );

      // The task row should be updated with the token and its expiry
      expect(mockPrisma.eventTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task1' },
          data: expect.objectContaining({ liffToken: token }),
        }),
      );
    });

    it('falls back to 14400 second TTL when config value is not set', async () => {
      mockConfig.get.mockReturnValue(undefined);
      mockRedis.setex.mockResolvedValue('OK');
      mockPrisma.eventTask.update.mockResolvedValue({ id: 'task1' });

      const token = await service.generateLiffToken('task1');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `liff:task:task1:${token}`,
        14400,
        '1',
      );
    });
  });

  describe('consumeLiffToken()', () => {
    it('returns true when the Redis key holds value "1"', async () => {
      mockRedis.getdel.mockResolvedValue('1');

      const result = await service.consumeLiffToken('task1', 'mytoken');

      expect(result).toBe(true);
      expect(mockRedis.getdel).toHaveBeenCalledWith('liff:task:task1:mytoken');
    });

    it('returns false when the Redis key is absent or already consumed', async () => {
      mockRedis.getdel.mockResolvedValue(null);

      const result = await service.consumeLiffToken('task1', 'mytoken');

      expect(result).toBe(false);
    });
  });
});
