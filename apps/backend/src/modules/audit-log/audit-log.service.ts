import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async log(data: {
    orgId: string;
    actorId: string;
    action: string;
    entity: string;
    entityId?: string;
    detail?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: data.orgId,
        actorId: data.actorId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        detail: data.detail,
      },
    });
  }

  async findAll(orgId: string, skip = 0, limit = 50) {
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          actor: { select: { id: true, displayName: true, role: true } },
        },
      }),
      this.prisma.auditLog.count({ where: { organizationId: orgId } }),
    ]);
    return { data, total };
  }

  async addNote(id: string, orgId: string, adminNote: string) {
    return this.prisma.auditLog.update({
      where: { id, organizationId: orgId },
      data: { adminNote },
      include: { actor: { select: { id: true, displayName: true, role: true } } },
    });
  }
}
