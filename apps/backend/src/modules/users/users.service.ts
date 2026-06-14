import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

const USER_SELECT = {
  id: true, email: true, displayName: true, role: true,
  phone: true, gender: true, avatarUrl: true,
  isActive: true, lineUserId: true, lineDisplayName: true, linePictureUrl: true, createdAt: true, supervisorId: true,
  zone: { select: { id: true, name: true, color: true } },
  supervisor: { select: { zone: { select: { id: true, name: true, color: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string) {
    return this.prisma.user.findMany({
      where: { organizationId: orgId },
      select: USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string, orgId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: orgId },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(data: CreateUserDto & { orgId: string }) {
    const passwordHash = await bcrypt.hash(data.password, 12);
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        displayName: data.displayName,
        role: data.role,
        phone: data.phone,
        gender: data.gender,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        address: data.address,
        specialty: data.specialty,
        organizationId: data.orgId,
      },
      select: USER_SELECT,
    });
  }

  async createFW(supervisorId: string, orgId: string, dto: CreateUserDto) {
    const hash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: {
        organizationId: orgId,
        email: dto.email,
        passwordHash: hash,
        role: 'CARE_GIVER',
        displayName: dto.displayName,
        phone: dto.phone,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        address: dto.address,
        supervisorId,
      },
      select: { id: true, email: true, displayName: true, role: true, supervisorId: true },
    });
  }

  async getMyFW(supervisorId: string, orgId: string) {
    return this.prisma.user.findMany({
      where: { supervisorId, organizationId: orgId, isActive: true },
      select: { id: true, displayName: true, email: true, role: true },
    });
  }

  async transferFW(fwId: string, newSupervisorId: string, orgId: string) {
    const fw = await this.prisma.user.findFirst({ where: { id: fwId, organizationId: orgId, role: 'CARE_GIVER' } });
    if (!fw) throw new NotFoundException('CARE_GIVER not found');
    const cm = await this.prisma.user.findFirst({ where: { id: newSupervisorId, organizationId: orgId, role: 'CASE_MANAGER' } });
    if (!cm) throw new NotFoundException('CASE_MANAGER not found');
    return this.prisma.user.update({
      where: { id: fwId },
      data: { supervisorId: newSupervisorId, zoneId: cm.zoneId },
      select: { id: true, displayName: true, supervisorId: true, zone: { select: { id: true, name: true, color: true } } },
    });
  }

  async update(id: string, orgId: string, actorId: string, dto: UpdateUserDto) {
    await this.findOne(id, orgId);
    if (dto.role !== undefined && id === actorId) {
      throw new BadRequestException('ไม่สามารถเปลี่ยนสิทธิ์ของตนเองได้');
    }
    if (dto.role === 'GUEST') {
      throw new BadRequestException('ไม่สามารถกำหนด Role เป็น GUEST ได้');
    }
    return this.prisma.user.update({
      where: { id },
      data: dto as any,
      select: USER_SELECT,
    });
  }

  async assignZone(userId: string, zoneId: string | null, orgId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId: orgId, role: 'CASE_MANAGER' } });
    if (!user) throw new NotFoundException('CASE_MANAGER not found');
    if (zoneId) {
      const zone = await this.prisma.zone.findFirst({ where: { id: zoneId, organizationId: orgId } });
      if (!zone) throw new NotFoundException('Zone not found');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { zoneId } }),
      this.prisma.user.updateMany({
        where: { supervisorId: userId, role: 'CARE_GIVER', organizationId: orgId },
        data: { zoneId },
      }),
    ]);
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, zone: { select: { id: true, name: true, color: true } } },
    });
  }

  async deactivate(id: string, orgId: string, actorId: string) {
    if (id === actorId) throw new BadRequestException('ไม่สามารถปิดบัญชีของตนเองได้');
    await this.findOne(id, orgId);
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, isActive: true },
    });
  }
}
