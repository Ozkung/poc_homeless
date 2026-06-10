import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DoctorService {
  constructor(private prisma: PrismaService) {}

  // ── Patients ─────────────────────────────────────────────────────────
  getPatients(orgId: string) {
    return this.prisma.patient.findMany({
      where: { organizationId: orgId },
      include: {
        caseManager: { select: { displayName: true } },
        zone: { select: { name: true, color: true } },
        diagnoses: { orderBy: { createdAt: 'desc' }, take: 1, select: { title: true, severity: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  getPatient(patientId: string, orgId: string) {
    return this.prisma.patient.findFirst({
      where: { id: patientId, organizationId: orgId },
      include: {
        caseManager: { select: { displayName: true } },
        zone: { select: { name: true, color: true } },
        diagnoses: { orderBy: { createdAt: 'desc' }, include: { doctor: { select: { displayName: true } } } },
        prescriptions: { orderBy: { createdAt: 'desc' }, include: { doctor: { select: { displayName: true } } } },
        carePlanItems: true,
      },
    });
  }

  // ── Diagnosis ─────────────────────────────────────────────────────────
  getDiagnoses(patientId: string) {
    return this.prisma.diagnosis.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: { doctor: { select: { displayName: true } } },
    });
  }

  createDiagnosis(patientId: string, doctorId: string, dto: any) {
    return this.prisma.diagnosis.create({ data: { patientId, doctorId, ...dto } });
  }

  updateDiagnosis(diagnosisId: string, doctorId: string, dto: any) {
    return this.prisma.diagnosis.update({ where: { id: diagnosisId, doctorId }, data: dto });
  }

  deleteDiagnosis(diagnosisId: string, doctorId: string) {
    return this.prisma.diagnosis.delete({ where: { id: diagnosisId, doctorId } });
  }

  // ── Prescription ──────────────────────────────────────────────────────
  getPrescriptions(patientId: string) {
    return this.prisma.prescription.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: { doctor: { select: { displayName: true } } },
    });
  }

  createPrescription(patientId: string, doctorId: string, dto: any) {
    return this.prisma.prescription.create({ data: { patientId, doctorId, ...dto } });
  }

  // ── Schedule ──────────────────────────────────────────────────────────
  getSchedules(orgId: string) {
    return this.prisma.doctorSchedule.findMany({
      where: { organizationId: orgId },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      include: { doctor: { select: { displayName: true, avatarUrl: true } } },
    });
  }

  createSchedule(doctorId: string, orgId: string, dto: any) {
    return this.prisma.doctorSchedule.create({
      data: { doctorId, organizationId: orgId, ...dto, date: new Date(dto.date) },
      include: { doctor: { select: { displayName: true } } },
    });
  }

  updateSchedule(scheduleId: string, doctorId: string, dto: any) {
    return this.prisma.doctorSchedule.update({
      where: { id: scheduleId, doctorId },
      data: { ...dto, date: dto.date ? new Date(dto.date) : undefined },
    });
  }

  deleteSchedule(scheduleId: string, doctorId: string) {
    return this.prisma.doctorSchedule.delete({ where: { id: scheduleId, doctorId } });
  }

  // ── Dashboard ─────────────────────────────────────────────────────────
  async getDashboard(orgId: string) {
    const [patients, recentDiagnoses, upcomingSchedules] = await Promise.all([
      this.prisma.patient.findMany({
        where: { organizationId: orgId },
        select: { id: true, status: true, gender: true, age: true, conditions: true },
      }),
      this.prisma.diagnosis.findMany({
        where: { patient: { organizationId: orgId } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          doctor: { select: { displayName: true } },
          patient: { select: { hn: true } },
        },
      }),
      this.prisma.doctorSchedule.findMany({
        where: { organizationId: orgId, date: { gte: new Date() } },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        take: 10,
        include: { doctor: { select: { displayName: true, avatarUrl: true } } },
      }),
    ]);

    // Status counts
    const statusCounts = patients.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Gender cluster
    const genderCounts = patients.reduce((acc, p) => {
      const g = p.gender ?? 'OTHER';
      acc[g] = (acc[g] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Age cluster
    const ageBands = [
      { label: '<18',   min: 0,  max: 17 },
      { label: '18–30', min: 18, max: 30 },
      { label: '31–45', min: 31, max: 45 },
      { label: '46–60', min: 46, max: 60 },
      { label: '>60',   min: 61, max: 999 },
    ];
    const ageClusters = ageBands.map(({ label, min, max }) => ({
      label,
      male:   patients.filter((p) => (p.age ?? 0) >= min && (p.age ?? 0) <= max && p.gender === 'MALE').length,
      female: patients.filter((p) => (p.age ?? 0) >= min && (p.age ?? 0) <= max && p.gender === 'FEMALE').length,
      other:  patients.filter((p) => (p.age ?? 0) >= min && (p.age ?? 0) <= max && (!p.gender || p.gender === 'OTHER')).length,
    }));

    return {
      total: patients.length,
      statusCounts,
      genderCounts,
      ageClusters,
      recentDiagnoses,
      upcomingSchedules,
    };
  }
}
