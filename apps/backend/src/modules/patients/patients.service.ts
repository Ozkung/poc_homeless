import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private crypto: AesGcmService,
    private notifications: NotificationsService,
  ) {}

  async findAll(orgId: string, role?: string, userId?: string) {
    let where: any = { organizationId: orgId };
    if (role === 'CARE_GIVER' && userId) {
      where = { organizationId: orgId, eventTasks: { some: { assigneeId: userId } } };
    }
    const patients = await this.prisma.patient.findMany({
      where,
      include: {
        caseManager: { select: { id: true, displayName: true } },
        zone: { select: { id: true, name: true, color: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return patients.map((p) => this.decrypt(p));
  }

  async findOne(id: string, orgId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Patient not found');
    return this.decrypt(patient);
  }

  private async generateHN(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const digits = String(Math.floor(Math.random() * 1_000_000_000_000)).padStart(12, '0');
      const hn = `HN${digits}`;
      const existing = await this.prisma.patient.findUnique({ where: { hn } });
      if (!existing) return hn;
    }
    throw new Error('ไม่สามารถสร้าง HN unique ได้ กรุณาลองใหม่');
  }

  async create(orgId: string, cmId: string, data: {
    name: string; age?: number; gender?: string;
    status?: string; conditions?: string[]; initialComplaint?: string;
    locationText?: string; phone?: string; birthDate?: string; nationalId?: string;
  }) {
    const hn = await this.generateHN();
    const patient = await this.prisma.patient.create({
      data: {
        organizationId: orgId,
        caseManagerId: cmId,
        nameEnc: this.crypto.encrypt(data.name),
        hn,
        age: data.age,
        gender: data.gender as any,
        status: data.status as any ?? 'PENDING',
        conditions: data.conditions ?? [],
        initialComplaint: data.initialComplaint,
        locationText: data.locationText,
        phone: data.phone,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        nationalIdEnc: data.nationalId ? this.crypto.encrypt(data.nationalId) : undefined,
      },
    });
    return this.decrypt(patient);
  }

  async update(id: string, orgId: string, data: Partial<{
    name: string; age: number; gender: string; status: string; conditions: string[]; locationText: string;
    phone: string; birthDate: string; nationalId: string;
  }>) {
    await this.findOne(id, orgId);
    const updateData: any = { ...data };
    if (data.name) { updateData.nameEnc = this.crypto.encrypt(data.name); delete updateData.name; }
    if (data.nationalId) { updateData.nationalIdEnc = this.crypto.encrypt(data.nationalId); delete updateData.nationalId; }
    if (data.birthDate) { updateData.birthDate = new Date(data.birthDate); delete updateData.birthDate; }
    const updated = await this.prisma.patient.update({ where: { id }, data: updateData });
    return this.decrypt(updated);
  }

  async remove(id: string, orgId: string) {
    await this.findOne(id, orgId);
    await this.prisma.patient.delete({ where: { id } });
  }

  async findActivities(id: string, orgId: string) {
    await this.findOne(id, orgId);
    return this.prisma.activity.findMany({
      where: { patientId: id },
      include: { actor: { select: { displayName: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findSubmissions(id: string, orgId: string) {
    await this.findOne(id, orgId);
    return this.prisma.submission.findMany({
      where: { patientId: id },
      include: { formTemplate: { select: { title: true } }, submittedBy: { select: { displayName: true } } },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async getCarePlan(patientId: string, orgId: string) {
    await this.findOne(patientId, orgId);
    return this.prisma.carePlanItem.findMany({
      where: { patientId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addCarePlanItem(
    patientId: string,
    orgId: string,
    data: { title: string; frequency: string; priority: string; assigneeName?: string },
  ) {
    await this.findOne(patientId, orgId);
    return this.prisma.carePlanItem.create({
      data: { patientId, ...data },
    });
  }

  async updateCarePlanItem(
    patientId: string,
    itemId: string,
    orgId: string,
    data: Partial<{ title: string; frequency: string; priority: string; assigneeName: string; isDone: boolean }>,
  ) {
    await this.findOne(patientId, orgId);
    return this.prisma.carePlanItem.update({
      where: { id: itemId, patientId },
      data,
    });
  }

  async deleteCarePlanItem(patientId: string, itemId: string, orgId: string) {
    await this.findOne(patientId, orgId);
    return this.prisma.carePlanItem.delete({
      where: { id: itemId, patientId },
    });
  }

  async listCarePlanAssessments(patientId: string, orgId: string, skip = 0, limit = 10) {
    await this.findOne(patientId, orgId);
    const [data, total] = await Promise.all([
      this.prisma.carePlanAssessment.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.carePlanAssessment.count({ where: { patientId } }),
    ]);
    return { data, total, skip, limit };
  }

  async getCarePlanAssessment(patientId: string, assessmentId: string, orgId: string) {
    await this.findOne(patientId, orgId);
    return this.prisma.carePlanAssessment.findFirst({ where: { id: assessmentId, patientId } });
  }

  async createCarePlanAssessment(patientId: string, orgId: string, dto: any) {
    await this.findOne(patientId, orgId);
    return this.prisma.carePlanAssessment.create({
      data: {
        patientId,
        ...dto,
        assessmentDate: dto.assessmentDate ? new Date(dto.assessmentDate) : undefined,
      },
    });
  }

  async updateCarePlanAssessment(patientId: string, assessmentId: string, orgId: string, dto: any) {
    await this.findOne(patientId, orgId);
    return this.prisma.carePlanAssessment.update({
      where: { id: assessmentId, patientId },
      data: {
        ...dto,
        assessmentDate: dto.assessmentDate ? new Date(dto.assessmentDate) : undefined,
      },
    });
  }

  async createSos(patientId: string, orgId: string, userId: string, coords: { lat?: number; lng?: number }) {
    const patient = await this.findOne(patientId, orgId); // throws if not found or wrong org
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });

    await Promise.all([
      this.prisma.activity.create({
        data: {
          actorId: userId,
          patientId,
          type: 'SOS',
          payload: { lat: coords.lat ?? null, lng: coords.lng ?? null },
        },
      }),
      this.prisma.alert.create({
        data: { patientId, type: 'SOS', lat: coords.lat, lng: coords.lng },
      }),
    ]);

    const cms = await this.prisma.user.findMany({
      where: {
        organizationId: orgId,
        role: UserRole.CASE_MANAGER,
        lineUserId: { not: null },
        isActive: true,
      },
      select: { lineUserId: true },
    });

    await Promise.all(
      cms
        .filter((cm) => cm.lineUserId)
        .map((cm) =>
          this.notifications.enqueueSosAlert({
            lineUserId: cm.lineUserId!,
            patientName: patient.name,
            hn: patient.hn,
            caregiverName: actor?.displayName ?? 'อาสา',
            lat: coords.lat,
            lng: coords.lng,
          }),
        ),
    );

    return { ok: true };
  }

  async createSosByTask(taskId: string, userId: string, coords: { lat?: number; lng?: number }) {
    const task = await this.prisma.eventTask.findUnique({
      where: { id: taskId },
      include: { patient: { select: { organizationId: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.createSos(task.patientId, task.patient.organizationId, userId, coords);
  }

  private decrypt(p: any) {
    return {
      ...p,
      name: this.crypto.decrypt(p.nameEnc),
      nameEnc: undefined,
      nationalId: p.nationalIdEnc ? this.crypto.decrypt(p.nationalIdEnc) : undefined,
      nationalIdEnc: undefined,
    };
  }
}
