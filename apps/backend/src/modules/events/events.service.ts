import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

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

  create(orgId: string, userId: string, data: {
    title: string; startDate: string; endDate: string;
    priority?: string; note?: string; patientIds?: string[];
    assigneeId?: string; formIds?: string[];
  }) {
    return this.prisma.event.create({
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
