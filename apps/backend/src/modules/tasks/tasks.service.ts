import { Injectable, NotFoundException, GoneException, HttpException, HttpStatus, BadRequestException, ConflictException } from '@nestjs/common';
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

  private readonly TASK_INCLUDE = {
    patient: { select: { id: true, hn: true, nameEnc: true, age: true, locationText: true, status: true, conditions: true, initialComplaint: true } },
    formTemplate: { select: { id: true, title: true, fields: true } },
    event: { select: { id: true, title: true, note: true, startDate: true, endDate: true, priority: true } },
  } as const;

  private async refreshTokensAndDecrypt(tasks: any[]) {
    await Promise.all(
      tasks
        .filter((t) => t.formTemplateId)
        .map(async (t) => {
          if (!t.liffToken) { await this.generateLiffToken(t.id); return; }
          const exists = await this.redis.exists(`liff:task:${t.id}:${t.liffToken}`);
          if (!exists) await this.generateLiffToken(t.id);
        }),
    );
    const refreshed = await this.prisma.eventTask.findMany({
      where: { id: { in: tasks.map((t) => t.id) } },
      select: { id: true, liffToken: true },
    });
    const tokenMap = Object.fromEntries(refreshed.map((t) => [t.id, t.liffToken]));
    return tasks.map((t: any) => ({
      ...t,
      liffToken: tokenMap[t.id] ?? t.liffToken,
      patient: t.patient ? { ...t.patient, name: this.crypto.decrypt(t.patient.nameEnc), nameEnc: undefined } : null,
    }));
  }

  async findTodayZoneTasks(userId: string, orgId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: orgId },
      select: { preferredZoneId: true },
    });
    if (!user?.preferredZoneId) return [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const tasks = await this.prisma.eventTask.findMany({
      where: {
        event: {
          organizationId: orgId,
          startDate: { lte: todayEnd },
          endDate:   { gte: todayStart },
        },
        patient: { zoneId: user.preferredZoneId },
      },
      include: this.TASK_INCLUDE,
      orderBy: { patient: { hn: 'asc' } },
    });

    return tasks.map((t: any) => ({
      taskId:      t.id,
      eventId:     t.event.id,
      eventTitle:  t.event.title,
      status:      t.status,
      patient: {
        id:         t.patient.id,
        hn:         t.patient.hn,
        name:       this.crypto.decrypt(t.patient.nameEnc),
        age:        t.patient.age,
        status:     t.patient.status,
        conditions: t.patient.conditions,
      },
      formTemplate: t.formTemplate ?? null,
    }));
  }

  private async getTaskForGuest(taskId: string, userId: string, orgId: string) {
    const task = await this.findOne(taskId);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: orgId },
      select: { preferredZoneId: true },
    });
    if (task.patient?.organizationId !== orgId) throw new NotFoundException('Task not found');
    if (!user?.preferredZoneId || task.patient?.zoneId !== user.preferredZoneId) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  async findMyTasks(userId: string) {
    const tasks = await this.prisma.eventTask.findMany({
      where: { assigneeId: userId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      include: this.TASK_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return this.refreshTokensAndDecrypt(tasks);
  }

  async findZoneTasks(userId: string, orgId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: orgId },
      select: { zoneId: true },
    });

    // If user has no zone assigned, fall back to tasks explicitly assigned to them
    if (!user?.zoneId) {
      return this.findMyTasks(userId);
    }

    // Merge zone-based tasks + tasks explicitly assigned to this user (dedup by id)
    const [zoneTasks, myTasks] = await Promise.all([
      this.prisma.eventTask.findMany({
        where: {
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          patient: { zoneId: user.zoneId, organizationId: orgId },
        },
        include: this.TASK_INCLUDE,
        orderBy: { event: { startDate: 'asc' } },
      }),
      this.prisma.eventTask.findMany({
        where: {
          assigneeId: userId,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
        include: this.TASK_INCLUDE,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Deduplicate: zone tasks take priority, add assigned tasks not already in zone list
    const seen = new Set(zoneTasks.map((t) => t.id));
    const merged = [...zoneTasks, ...myTasks.filter((t) => !seen.has(t.id))];

    return this.refreshTokensAndDecrypt(merged);
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

  async guestCheckin(taskId: string, userId: string, orgId: string): Promise<{ activityId: string }> {
    const task = await this.getTaskForGuest(taskId, userId, orgId);
    const [, activity] = await this.prisma.$transaction([
      this.prisma.eventTask.update({
        where: { id: taskId },
        data: { status: task.status === 'PENDING' ? 'IN_PROGRESS' : task.status },
      }),
      this.prisma.activity.create({
        data: {
          actorId:   userId,
          patientId: task.patientId,
          taskId,
          eventId:   task.eventId,
          type:      'CHECK_IN',
          payload:   Prisma.DbNull,
        },
      }),
    ]);
    return { activityId: activity.id };
  }

  async guestAddNote(taskId: string, userId: string, orgId: string, note: string): Promise<{ activityId: string }> {
    const task = await this.getTaskForGuest(taskId, userId, orgId);
    const activity = await this.prisma.activity.create({
      data: {
        actorId:   userId,
        patientId: task.patientId,
        taskId,
        eventId:   task.eventId,
        type:      'NOTE',
        payload:   { note },
      },
    });
    return { activityId: activity.id };
  }

  async findTaskActivities(taskId: string, orgId: string) {
    const task = await this.prisma.eventTask.findFirst({
      where: { id: taskId, patient: { organizationId: orgId } },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.prisma.activity.findMany({
      where: { taskId, type: 'CHECK_IN' },
      include: { actor: { select: { displayName: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async guestSubmitForm(
    taskId: string, userId: string, orgId: string,
    answers: Array<{ fieldId: string; value: string }>,
  ): Promise<{ submissionId: string }> {
    const task = await this.getTaskForGuest(taskId, userId, orgId);
    if (task.status === 'DONE') {
      throw new ConflictException('Form already submitted for this task');
    }
    if (!task.formTemplateId) throw new BadRequestException('Task has no form template');

    const [submission] = await this.prisma.$transaction([
      this.prisma.submission.create({
        data: {
          taskId,
          patientId:      task.patientId,
          formTemplateId: task.formTemplateId,
          submittedById:  userId,
          answers:        answers as any,
        },
      }),
      this.prisma.activity.create({
        data: {
          actorId:   userId,
          patientId: task.patientId,
          taskId,
          eventId:   task.eventId,
          type:      'FORM_SUBMIT',
          payload:   { formTitle: task.formTemplate?.title ?? 'แบบสำรวจ' },
        },
      }),
      this.prisma.eventTask.update({
        where: { id: taskId },
        data:  { status: 'DONE' },
      }),
    ]);

    return { submissionId: submission.id };
  }
}
