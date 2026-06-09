import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getAdminStats(orgId: string, from: Date, to: Date) {
    const [total, critical, pending, stable] = await Promise.all([
      this.prisma.patient.count({ where: { organizationId: orgId } }),
      this.prisma.patient.count({ where: { organizationId: orgId, status: 'CRITICAL' } }),
      this.prisma.patient.count({ where: { organizationId: orgId, status: 'PENDING' } }),
      this.prisma.patient.count({ where: { organizationId: orgId, status: 'STABLE' } }),
    ]);

    const [totalTasks, doneTasks] = await Promise.all([
      this.prisma.eventTask.count({ where: { event: { organizationId: orgId }, createdAt: { gte: from, lte: to } } }),
      this.prisma.eventTask.count({ where: { event: { organizationId: orgId }, status: 'DONE', createdAt: { gte: from, lte: to } } }),
    ]);

    const users = await this.prisma.user.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { role: true },
    });
    const activeCM = users.filter((u) => u.role === 'CASE_MANAGER').length;
    const activeFW = users.filter((u) => u.role === 'FIELD_WORKER').length;

    const patientsWithZone = await this.prisma.patient.findMany({
      where: { organizationId: orgId },
      select: { zoneId: true, zone: { select: { name: true } } },
    });
    const zoneMap = new Map<string, { name: string; count: number }>();
    for (const p of patientsWithZone) {
      const key = p.zoneId ?? 'unassigned';
      const name = (p as any).zone?.name ?? 'ไม่ระบุ Zone';
      const entry = zoneMap.get(key) ?? { name, count: 0 };
      entry.count++;
      zoneMap.set(key, entry);
    }

    return {
      patients: { total, critical, pending, stable },
      taskSuccessRate: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
      activeCM,
      activeFW,
      zoneBreakdown: Array.from(zoneMap.values()),
    };
  }

  async getCMStats(cmId: string, orgId: string) {
    const myPatients = await this.prisma.patient.findMany({
      where: { caseManagerId: cmId, organizationId: orgId },
      select: { id: true, status: true, zoneId: true, zone: { select: { name: true } }, age: true, conditions: true },
    });

    const subordinates = await this.prisma.user.findMany({
      where: { supervisorId: cmId, role: 'FIELD_WORKER', isActive: true },
      select: { id: true, displayName: true },
    });

    const patientIds = myPatients.map((p) => p.id);
    const since6m = new Date();
    since6m.setMonth(since6m.getMonth() - 6);

    const [totalTasks, doneTasks] = await Promise.all([
      this.prisma.eventTask.count({ where: { patientId: { in: patientIds }, createdAt: { gte: since6m } } }),
      this.prisma.eventTask.count({ where: { patientId: { in: patientIds }, status: 'DONE', createdAt: { gte: since6m } } }),
    ]);

    const statusImproved = await this.prisma.activity.findMany({
      where: {
        type: 'STATUS_CHANGE',
        patientId: { in: patientIds },
        createdAt: { gte: since6m },
        payload: { path: ['newStatus'], equals: 'STABLE' },
      },
      select: { patientId: true },
      distinct: ['patientId'],
    });

    const recentActions = await this.prisma.activity.findMany({
      where: { patientId: { in: patientIds } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        createdAt: true, type: true,
        actor: { select: { displayName: true } },
        patient: { select: { hn: true } },
      },
    });

    const zoneCards = this.buildZoneCards(myPatients);

    return {
      myPatientsCount: myPatients.length,
      myFWCount: subordinates.length,
      taskSuccessRate: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
      statusImproved: statusImproved.length,
      zoneCards,
      recentActions,
    };
  }

  private buildZoneCards(patients: any[]) {
    const zoneMap = new Map<string, { zoneId: string; zoneName: string; count: number }>();
    for (const p of patients) {
      const key = p.zoneId ?? 'unassigned';
      const name = p.zone?.name ?? 'ไม่ระบุ Zone';
      const entry = zoneMap.get(key) ?? { zoneId: key, zoneName: name, count: 0 };
      entry.count++;
      zoneMap.set(key, entry);
    }
    return Array.from(zoneMap.values());
  }

  async getFWStats(fwId: string, orgId: string) {
    const assignedPatients = await this.prisma.patient.findMany({
      where: { organizationId: orgId, eventTasks: { some: { assigneeId: fwId } } },
      select: { id: true, age: true, conditions: true, hn: true },
    });

    const patientIds = assignedPatients.map((p) => p.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayTasks = await this.prisma.eventTask.findMany({
      where: { assigneeId: fwId, createdAt: { gte: today, lt: tomorrow } },
      select: { id: true, status: true, event: { select: { title: true } }, patient: { select: { hn: true } } },
    });

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const submittedToday = await this.prisma.activity.findMany({
      where: { patientId: { in: patientIds }, type: 'FORM_SUBMIT', createdAt: { gte: since24h } },
      select: { patientId: true },
      distinct: ['patientId'],
    });
    const submittedIds = new Set(submittedToday.map((a) => a.patientId));

    const medicationAdherence = {
      total: patientIds.length,
      reported: submittedIds.size,
      list: assignedPatients.map((p) => ({ hn: p.hn, reported: submittedIds.has(p.id) })),
    };

    const since1m = new Date();
    since1m.setMonth(since1m.getMonth() - 1);
    const [mTasks, mDone] = await Promise.all([
      this.prisma.eventTask.count({ where: { assigneeId: fwId, createdAt: { gte: since1m } } }),
      this.prisma.eventTask.count({ where: { assigneeId: fwId, status: 'DONE', createdAt: { gte: since1m } } }),
    ]);

    return {
      myPatientsCount: patientIds.length,
      todayPending: todayTasks.filter((t) => t.status === 'PENDING').length,
      medicationAdherence,
      taskSuccessRate: mTasks > 0 ? Math.round((mDone / mTasks) * 100) : 0,
      ageDistribution: this.buildAgeDistribution(assignedPatients),
      topConditions: this.buildTopConditions(assignedPatients),
      todayTasks,
    };
  }

  private buildAgeDistribution(patients: { age: number | null }[]) {
    const buckets = [
      { label: '18-30', min: 18, max: 30, count: 0 },
      { label: '31-45', min: 31, max: 45, count: 0 },
      { label: '46-60', min: 46, max: 60, count: 0 },
      { label: '60+', min: 61, max: 999, count: 0 },
    ];
    for (const p of patients) {
      if (!p.age) continue;
      const bucket = buckets.find((b) => p.age! >= b.min && p.age! <= b.max);
      if (bucket) bucket.count++;
    }
    return buckets.map(({ label, count }) => ({ label, count }));
  }

  private buildTopConditions(patients: { conditions: string[] }[]) {
    const freq = new Map<string, number>();
    for (const p of patients) {
      for (const c of p.conditions) freq.set(c, (freq.get(c) ?? 0) + 1);
    }
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([condition, count]) => ({ condition, count }));
  }

  async getMedVolStats(orgId: string) {
    const [itemCount, lowStockItems, pendingRequests, patients] = await Promise.all([
      this.prisma.inventoryItem.count({ where: { organizationId: orgId, isActive: true } }),
      this.prisma.inventoryItem.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, name: true, unit: true, currentStock: true, lowStockThreshold: true },
      }),
      this.prisma.adjRequest.count({ where: { item: { organizationId: orgId }, status: 'PENDING' } }),
      this.prisma.patient.groupBy({ by: ['status'], where: { organizationId: orgId }, _count: true }),
    ]);

    const lowStock = lowStockItems.filter((i) => i.currentStock <= i.lowStockThreshold);
    const pendingRequestsList = await this.prisma.adjRequest.findMany({
      where: { item: { organizationId: orgId }, status: 'PENDING' },
      take: 10,
      select: {
        id: true, quantity: true, reason: true,
        item: { select: { name: true, unit: true } },
        requester: { select: { displayName: true } },
      },
    });

    const statusMap = Object.fromEntries(patients.map((p) => [p.status, p._count]));

    return {
      itemCount,
      lowStockCount: lowStock.length,
      pendingRequestCount: pendingRequests,
      totalPatients: (statusMap['STABLE'] ?? 0) + (statusMap['PENDING'] ?? 0) + (statusMap['CRITICAL'] ?? 0),
      stockLevels: lowStockItems.slice(0, 10).map((i) => ({
        ...i,
        pct: Math.round((i.currentStock / Math.max(i.lowStockThreshold * 3, 1)) * 100),
      })),
      patientStatus: { stable: statusMap['STABLE'] ?? 0, pending: statusMap['PENDING'] ?? 0, critical: statusMap['CRITICAL'] ?? 0 },
      pendingRequestsList,
    };
  }
}
