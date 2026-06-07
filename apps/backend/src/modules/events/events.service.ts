import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private tasks: TasksService,
  ) {}

  findAll(orgId: string, month?: number, year?: number) {
    const where: any = { organizationId: orgId };
    if (month && year) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59);
      where.startDate = { gte: start, lte: end };
    }
    return this.prisma.event.findMany({
      where,
      include: {
        tasks: { include: { assignee: { select: { displayName: true } }, patient: { select: { hn: true, nameEnc: true } } } },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  async findOne(id: string, orgId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id, organizationId: orgId },
      include: { tasks: { include: { assignee: { select: { displayName: true, email: true } } } } },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async create(orgId: string, userId: string, data: {
    title: string; startDate: string; endDate: string;
    priority?: string; note?: string; patientIds?: string[];
    assigneeId?: string; formIds?: string[];
  }) {
    // Create the Event record first
    const event = await this.prisma.event.create({
      data: {
        organizationId: orgId,
        createdById: userId,
        title: data.title,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        priority: data.priority as any ?? 'NORMAL',
        note: data.note,
      },
    });

    // Auto-generate one EventTask per patient if patientIds and assigneeId are provided
    if (data.patientIds?.length && data.assigneeId) {
      const formTemplateId = data.formIds?.[0] ?? undefined;
      for (const patientId of data.patientIds) {
        const task = await this.prisma.eventTask.create({
          data: {
            eventId: event.id,
            patientId,
            assigneeId: data.assigneeId,
            formTemplateId: formTemplateId ?? null,
          },
        });
        await this.tasks.generateLiffToken(task.id);
      }
    }

    // Return event with tasks included
    return this.prisma.event.findUnique({
      where: { id: event.id },
      include: {
        tasks: {
          include: {
            assignee: { select: { displayName: true, email: true } },
            patient: { select: { hn: true, nameEnc: true } },
          },
        },
      },
    });
  }

  async update(id: string, orgId: string, data: any) {
    await this.findOne(id, orgId);
    return this.prisma.event.update({ where: { id }, data });
  }

  async remove(id: string, orgId: string) {
    await this.findOne(id, orgId);
    return this.prisma.event.delete({ where: { id } });
  }
}
