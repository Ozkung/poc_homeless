import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FormsService {
  constructor(private prisma: PrismaService) {}

  findAll(orgId: string) {
    return this.prisma.formTemplate.findMany({
      where: { organizationId: orgId, isActive: true },
      include: { createdBy: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, orgId: string) {
    const form = await this.prisma.formTemplate.findFirst({ where: { id, organizationId: orgId } });
    if (!form) throw new NotFoundException('Form template not found');
    return form;
  }

  create(orgId: string, userId: string, data: { title: string; description?: string; fields: any[] }) {
    return this.prisma.formTemplate.create({
      data: { organizationId: orgId, createdById: userId, title: data.title, description: data.description, fields: data.fields },
    });
  }

  async update(id: string, orgId: string, data: Partial<{ title: string; description: string; fields: any[]; isActive: boolean }>) {
    await this.findOne(id, orgId);
    return this.prisma.formTemplate.update({ where: { id }, data });
  }

  async remove(id: string, orgId: string) {
    await this.findOne(id, orgId);
    return this.prisma.formTemplate.update({ where: { id }, data: { isActive: false } });
  }
}
