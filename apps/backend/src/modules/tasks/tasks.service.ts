import { Injectable, NotFoundException, GoneException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private crypto: AesGcmService,
    @InjectRedis() private redis: Redis,
  ) {}

  async findMyTasks(userId: string) {
    const tasks = await this.prisma.eventTask.findMany({
      where: { assigneeId: userId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      include: {
        patient: { select: { id: true, hn: true, nameEnc: true, locationText: true, status: true, conditions: true, initialComplaint: true } },
        formTemplate: { select: { id: true, title: true, fields: true } },
        event: { select: { id: true, title: true, note: true, startDate: true, endDate: true, priority: true } },
        liffToken: true,
        tokenExp: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return tasks.map((t: any) => ({
      ...t,
      patient: t.patient ? { ...t.patient, name: this.crypto.decrypt(t.patient.nameEnc), nameEnc: undefined } : null,
    }));
  }

  async findOne(id: string) {
    const task = await this.prisma.eventTask.findUnique({
      where: { id },
      include: {
        patient: true,
        formTemplate: true,
        event: true,
        assignee: { select: { displayName: true, lineUserId: true } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  create(data: { eventId: string; patientId: string; assigneeId: string; formTemplateId?: string }) {
    return this.prisma.eventTask.create({ data });
  }

  async checkin(taskId: string, userId: string) {
    const task = await this.findOne(taskId);
    if (task.assigneeId !== userId) throw new NotFoundException('Task not found');

    const rateLimitKey = `checkin:${taskId}:${userId}`;
    const existing = await this.redis.get(rateLimitKey);
    if (existing) throw new HttpException('Check-in already recorded in the last hour', HttpStatus.TOO_MANY_REQUESTS);

    await this.redis.setex(rateLimitKey, 3600, '1');
    const [updated] = await Promise.all([
      this.prisma.eventTask.update({
        where: { id: taskId },
        data: { status: 'IN_PROGRESS' },
      }),
      this.prisma.activity.create({
        data: {
          actorId: userId,
          patientId: task.patientId,
          taskId,
          type: 'CHECK_IN',
          payload: Prisma.DbNull,
        },
      }),
    ]);
    return updated;
  }

  async addNote(taskId: string, userId: string, note: string) {
    const task = await this.findOne(taskId);
    if (task.assigneeId !== userId) throw new NotFoundException();
    return this.prisma.activity.create({
      data: { actorId: userId, taskId, type: 'NOTE', payload: { note } },
    });
  }

  async updateStatus(taskId: string, userId: string, status: string) {
    const task = await this.findOne(taskId);
    if (task.assigneeId !== userId) throw new NotFoundException();
    return this.prisma.eventTask.update({ where: { id: taskId }, data: { status: status as any } });
  }

  async generateLiffToken(taskId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const ttl = this.config.get<number>('line.liffTokenTtl') ?? 14400;
    const exp = new Date(Date.now() + ttl * 1000);

    await Promise.all([
      this.redis.setex(`liff:task:${taskId}:${token}`, ttl, '1'),
      this.prisma.eventTask.update({ where: { id: taskId }, data: { liffToken: token, tokenExp: exp } }),
    ]);
    return token;
  }

  async consumeLiffToken(taskId: string, token: string): Promise<boolean> {
    const key = `liff:task:${taskId}:${token}`;
    const result = await this.redis.getdel(key);
    return result === '1';
  }
}
