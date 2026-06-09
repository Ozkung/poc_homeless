import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';

@Injectable()
export class ZonesService {
  constructor(private prisma: PrismaService) {}

  findAll(orgId: string) {
    return this.prisma.zone.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { patients: true } } },
    });
  }

  async findOne(id: string, orgId: string) {
    const zone = await this.prisma.zone.findFirst({ where: { id, organizationId: orgId } });
    if (!zone) throw new NotFoundException('Zone not found');
    return zone;
  }

  create(orgId: string, dto: CreateZoneDto) {
    return this.prisma.zone.create({
      data: { organizationId: orgId, name: dto.name, description: dto.description, color: dto.color },
    });
  }

  async update(id: string, orgId: string, dto: UpdateZoneDto) {
    await this.findOne(id, orgId);
    return this.prisma.zone.update({ where: { id }, data: dto });
  }

  async remove(id: string, orgId: string) {
    await this.findOne(id, orgId);
    return this.prisma.zone.delete({ where: { id } });
  }
}
