import { Injectable, GoneException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';

@Injectable()
export class SubmissionsService {
  constructor(private prisma: PrismaService, private tasks: TasksService, private crypto: AesGcmService) {}

  async create(userId: string, data: {
    taskId: string; token: string; answers: Array<{ fieldId: string; value: unknown }>;
  }) {
    const task = await this.tasks.findOne(data.taskId);
    if (!task.formTemplateId) throw new BadRequestException('Task has no form');

    const valid = await this.tasks.consumeLiffToken(data.taskId, data.token);
    if (!valid) throw new GoneException('Token expired or already used');

    const encryptedAnswers = data.answers.map((a) => ({
      fieldId: a.fieldId,
      value: this.crypto.encrypt(String(a.value)),
    }));

    return this.prisma.submission.create({
      data: {
        taskId: data.taskId,
        patientId: task.patientId,
        formTemplateId: task.formTemplateId,
        submittedById: userId,
        // Prisma's Json type doesn't accept `unknown` values — structurally correct at runtime
        answers: encryptedAnswers as any,
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
