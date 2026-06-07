import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';
import { UserRole } from '@prisma/client';

export const TRIAGE = {
  CRITICAL: { visitFreq: 2, alertAfter: 1, missingAfter: 5 },
  PENDING:  { visitFreq: 4, alertAfter: 2, missingAfter: 14 },
  STABLE:   { visitFreq: 7, alertAfter: 3, missingAfter: 30 },
} as const;

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private crypto: AesGcmService,
  ) {}

  @Cron('0 6 * * *')
  async runEscalationCheck() {
    this.logger.log('Running escalation check…');
    const patients = await this.prisma.patient.findMany({
      where: { status: { in: ['CRITICAL', 'PENDING', 'STABLE'] } },
    });

    for (const patient of patients) {
      const config = TRIAGE[patient.status as keyof typeof TRIAGE];
      if (!config) continue;

      const lastActivity = await this.prisma.activity.findFirst({
        where: { patientId: patient.id, type: 'CHECK_IN' },
        orderBy: { createdAt: 'desc' },
      });

      const baseline = lastActivity?.createdAt ?? patient.createdAt ?? new Date();
      const nowDate = new Date();
      const baseDate = new Date(baseline);
      nowDate.setHours(0, 0, 0, 0);
      baseDate.setHours(0, 0, 0, 0);
      const daysMissed = Math.round((nowDate.getTime() - baseDate.getTime()) / 86_400_000);

      if (daysMissed < config.alertAfter) continue;

      const cms = await this.prisma.user.findMany({
        where: {
          organizationId: patient.organizationId,
          role: UserRole.CASE_MANAGER,
          lineUserId: { not: null },
          isActive: true,
        },
        select: { lineUserId: true },
      });

      const patientName = this.crypto.decrypt(patient.nameEnc);

      if (daysMissed >= config.missingAfter && patient.status !== 'MISSING') {
        await this.prisma.patient.update({ where: { id: patient.id }, data: { status: 'MISSING' } });
        await this.prisma.alert.create({ data: { patientId: patient.id, type: 'MISSING', daysMissed } });
        for (const cm of cms) {
          if (cm.lineUserId) {
            await this.notifications.enqueueOverdueAlert({
              lineUserId: cm.lineUserId,
              patientName,
              hn: patient.hn,
              status: 'MISSING',
              daysMissed,
            });
          }
        }
        continue;
      }

      // Dedup: no OVERDUE alert sent today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const existing = await this.prisma.alert.findFirst({
        where: {
          patientId: patient.id,
          type: 'OVERDUE',
          resolvedAt: null,
          sentAt: { gte: todayStart },
        },
      });
      if (existing) continue;

      await this.prisma.alert.create({ data: { patientId: patient.id, type: 'OVERDUE', daysMissed } });
      for (const cm of cms) {
        if (cm.lineUserId) {
          await this.notifications.enqueueOverdueAlert({
            lineUserId: cm.lineUserId,
            patientName,
            hn: patient.hn,
            status: patient.status,
            daysMissed,
          });
        }
      }
    }
    this.logger.log('Escalation check complete');
  }

  @Cron('45 7 * * *')
  async sendCaregiverMorningBriefing() {
    this.logger.log('Sending morning briefings…');
    const patients = await this.prisma.patient.findMany({
      where: { status: { in: ['CRITICAL', 'PENDING', 'STABLE'] } },
    });

    const caregiverMap = new Map<string, {
      lineUserId: string;
      patients: { name: string; hn: string; status: string; locationText?: string }[];
    }>();

    for (const patient of patients) {
      const config = TRIAGE[patient.status as keyof typeof TRIAGE];
      if (!config) continue;

      const lastActivity = await this.prisma.activity.findFirst({
        where: { patientId: patient.id, type: 'CHECK_IN' },
        orderBy: { createdAt: 'desc' },
      });

      const baseline = lastActivity?.createdAt ?? patient.createdAt ?? new Date();
      const nowDate2 = new Date();
      const baseDate2 = new Date(baseline);
      nowDate2.setHours(0, 0, 0, 0);
      baseDate2.setHours(0, 0, 0, 0);
      const daysSince = Math.round((nowDate2.getTime() - baseDate2.getTime()) / 86_400_000);
      if (daysSince < config.visitFreq) continue;

      const task = await this.prisma.eventTask.findFirst({
        where: { patientId: patient.id, status: { in: ['PENDING', 'IN_PROGRESS'] } },
        include: { assignee: { select: { id: true, lineUserId: true } } },
        orderBy: { createdAt: 'desc' },
      });

      const caregiver = task?.assignee;
      if (!caregiver?.lineUserId) continue;

      if (!caregiverMap.has(caregiver.id)) {
        caregiverMap.set(caregiver.id, { lineUserId: caregiver.lineUserId, patients: [] });
      }
      caregiverMap.get(caregiver.id)!.patients.push({
        name: this.crypto.decrypt(patient.nameEnc),
        hn: patient.hn,
        status: patient.status,
        locationText: patient.locationText ?? undefined,
      });
    }

    for (const { lineUserId, patients: pts } of caregiverMap.values()) {
      await this.notifications.enqueueMorningBriefing({ lineUserId, patients: pts });
    }
    this.logger.log(`Morning briefings queued for ${caregiverMap.size} caregivers`);
  }

  async getActiveAlerts(orgId: string) {
    return this.prisma.alert.findMany({
      where: { resolvedAt: null, patient: { organizationId: orgId } },
      include: {
        patient: { select: { id: true, hn: true, nameEnc: true, status: true, locationText: true } },
      },
      orderBy: [{ type: 'asc' }, { sentAt: 'desc' }],
      take: 20,
    });
  }
}
