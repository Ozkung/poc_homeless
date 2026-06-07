import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    // Step 1: Validate assigneeId and patientIds upfront to surface clear errors
    if (data.assigneeId) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: data.assigneeId, organizationId: orgId },
      });
      if (!assignee) {
        throw new BadRequestException(`Assignee ${data.assigneeId} not found in this organization`);
      }
    }

    if (data.patientIds?.length) {
      const foundPatients = await this.prisma.patient.findMany({
        where: { id: { in: data.patientIds }, organizationId: orgId },
        select: { id: true },
      });
      if (foundPatients.length !== data.patientIds.length) {
        throw new BadRequestException('One or more patientIds not found in this organization');
      }
    }

    // Step 2: Wrap event + task creation in a single transaction
    const { event, tasks } = await this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
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

      const tasks: { id: string }[] = [];
      // Auto-generate one EventTask per patient if patientIds and assigneeId are provided
      if (data.patientIds?.length && data.assigneeId) {
        const formTemplateId = data.formIds?.[0] ?? null;
        for (const patientId of data.patientIds) {
          const task = await tx.eventTask.create({
            data: {
              eventId: event.id,
              patientId,
              assigneeId: data.assigneeId,
              formTemplateId,
            },
          });
          tasks.push(task);
        }
      }

      return { event, tasks };
    });

    // Step 3: Generate LIFF tokens outside transaction (Redis cannot participate in DB tx)
    // Errors here are non-fatal — event and tasks are already committed and tokens can be regenerated
    try {
      await Promise.all(tasks.map((t) => this.tasks.generateLiffToken(t.id)));
    } catch {
      // LIFF token generation is best-effort; do not fail the request
    }

    // Step 4: Return event with tasks included
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
