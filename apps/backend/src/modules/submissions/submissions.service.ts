import { Injectable, GoneException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';

@Injectable()
export class SubmissionsService {
  constructor(private prisma: PrismaService, private tasks: TasksService) {}

  async create(userId: string, data: {
    taskId: string; token: string; answers: Array<{ fieldId: string; value: unknown }>;
  }) {
    const task = await this.tasks.findOne(data.taskId);
    if (!task.formTemplateId) throw new BadRequestException('Task has no form');

    const valid = await this.tasks.consumeLiffToken(data.taskId, data.token);
    if (!valid) throw new GoneException('Token expired or already used');

    return this.prisma.submission.create({
      data: {
        taskId: data.taskId,
        patientId: task.patientId,
        formTemplateId: task.formTemplateId,
        submittedById: userId,
        answers: data.answers,
      },
    });
  }

  findByTask(taskId: string) {
    return this.prisma.submission.findMany({
      where: { taskId },
      include: { submittedBy: { select: { displayName: true } } },
      orderBy: { submittedAt: 'desc' },
    });
  }
}
