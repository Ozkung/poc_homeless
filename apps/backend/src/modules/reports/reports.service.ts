import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getMonthly(orgId: string, month: number, year: number) {
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0, 23, 59, 59);

    const tasks = await this.prisma.eventTask.findMany({
      where: {
        event: {
          organizationId: orgId,
          startDate: { lte: end },
          endDate:   { gte: start },
        },
      },
      include: { patient: { select: { id: true, hn: true, status: true, conditions: true } } },
    });

    const totalTasks     = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'DONE').length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const followUpDone = tasks.filter((t) => t.status === 'DONE' || t.status === 'NOT_FOUND').length;
    const followUpRate  = totalTasks > 0 ? Math.round((followUpDone / totalTasks) * 100) : 0;

    const submissionCount = await this.prisma.submission.count({
      where: {
        task: { event: { organizationId: orgId } },
        submittedAt: { gte: start, lte: end },
      },
    });
    const medicationRate = totalTasks > 0 ? Math.round((submissionCount / totalTasks) * 100) : 0;

    const patients = await this.prisma.patient.findMany({
      where: { organizationId: orgId },
      select: { id: true, hn: true, status: true, conditions: true, followUpTarget: true },
    });

    const patientStats = patients.map((p) => {
      const pTasks = tasks.filter((t) => t.patientId === p.id);
      const pDone  = pTasks.filter((t) => t.status === 'DONE').length;
      return {
        id:            p.id,
        hn:            p.hn,
        status:        p.status,
        conditions:    p.conditions,
        followUpDone:  pDone,
        followUpTotal: pTasks.length,
        followUpTarget: p.followUpTarget ?? null,
      };
    });

    return { followUpRate, medicationRate, completionRate, totalTasks, completedTasks, patients: patientStats };
  }
}
