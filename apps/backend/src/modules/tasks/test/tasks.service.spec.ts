import { Test } from '@nestjs/testing';
import { NotFoundException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
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
  get: jest.fn(),
  setex: jest.fn(),
  getdel: jest.fn(),
  del: jest.fn(),
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

    it('throws 429 TooManyRequests when Redis rate-limit key exists', async () => {
      const task = { id: 'task1', assigneeId: 'user1', status: 'PENDING', event: {}, patient: {}, assignee: {} };
      mockPrisma.eventTask.findUnique.mockResolvedValue(task);
      mockRedis.get.mockResolvedValue('1');

      const err = await service.checkin('task1', 'user1').catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(429);
      expect(mockPrisma.eventTask.update).not.toHaveBeenCalled();
    });

    it('sets Redis rate-limit key with 1hr TTL and updates task on successful check-in', async () => {
      const task = { id: 'task1', assigneeId: 'user1', status: 'PENDING', event: {}, patient: {}, assignee: {} };
      mockPrisma.eventTask.findUnique.mockResolvedValue(task);
      mockPrisma.eventTask.update.mockResolvedValue({ id: 'task1', status: 'IN_PROGRESS' });
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      const result = await service.checkin('task1', 'user1');

      expect(mockRedis.setex).toHaveBeenCalledWith('checkin:task1:user1', 3600, '1');
      expect(result).toMatchObject({ status: 'IN_PROGRESS' });
    });

    it('checkin creates a CHECK_IN Activity for the patient', async () => {
      mockPrisma.eventTask.findUnique.mockResolvedValue({
        id: 't1', assigneeId: 'u1', patientId: 'p1', event: {}, patient: {}, assignee: {},
      });
      mockPrisma.eventTask.update.mockResolvedValue({ id: 't1', status: 'IN_PROGRESS' });
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      // Ensure activity mock exists
      if (!mockPrisma.activity) mockPrisma.activity = { create: jest.fn().mockResolvedValue({ id: 'act1' }) };
      else mockPrisma.activity.create = jest.fn().mockResolvedValue({ id: 'act1' });

      await service.checkin('t1', 'u1');

      expect(mockPrisma.activity.create).toHaveBeenCalledWith({
        data: { actorId: 'u1', patientId: 'p1', taskId: 't1', type: 'CHECK_IN', payload: Prisma.DbNull },
      });
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

  describe('updateStatus()', () => {
    it('updates status for assignee', async () => {
      const task = { id: 'task1', assigneeId: 'user1', status: 'IN_PROGRESS' };
      const updatedTask = { ...task, status: 'DONE' };
      mockPrisma.eventTask.findUnique.mockResolvedValue(task);
      mockPrisma.eventTask.update.mockResolvedValue(updatedTask);

      const result = await service.updateStatus('task1', 'user1', 'DONE');

      expect(mockPrisma.eventTask.update).toHaveBeenCalledWith({
        where: { id: 'task1' },
        data: { status: 'DONE' },
      });
      expect(result.status).toBe('DONE');
    });

    it('throws NotFoundException for non-assignee', async () => {
      const task = { id: 'task1', assigneeId: 'user1', status: 'PENDING' };
      mockPrisma.eventTask.findUnique.mockResolvedValue(task);

      await expect(service.updateStatus('task1', 'wrong-user', 'DONE')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.eventTask.update).not.toHaveBeenCalled();
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
