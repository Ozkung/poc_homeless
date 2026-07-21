import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { LineService } from '../line/line.service';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateFwDto } from './dto/create-fw.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

// Core fields — safe to query even before lineDisplayName/linePictureUrl migration
const USER_SELECT_CORE = {
  id: true, email: true, displayName: true, role: true,
  phone: true, gender: true, avatarUrl: true,
  isActive: true, lineUserId: true, createdAt: true, supervisorId: true,
  zone: { select: { id: true, name: true, color: true } },
  supervisor: { select: { zone: { select: { id: true, name: true, color: true } } } },
} as const;

// Extended fields added by migration 20260614050000_add_line_profile
const LINE_PROFILE_SELECT = {
  lineDisplayName: true,
  linePictureUrl: true,
} as const;

const USER_SELECT = { ...USER_SELECT_CORE, ...LINE_PROFILE_SELECT } as const;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogService,
    private line: LineService,
  ) {}

  async findAll(orgId: string) {
    // Try full select with LINE profile fields; fall back to core if migration not yet applied
    try {
      return await this.prisma.user.findMany({
        where: { organizationId: orgId },
        select: USER_SELECT,
        orderBy: { createdAt: 'asc' },
      });
    } catch {
      return this.prisma.user.findMany({
        where: { organizationId: orgId },
        select: USER_SELECT_CORE,
        orderBy: { createdAt: 'asc' },
      });
    }
  }

  async findOne(id: string, orgId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: orgId },
      select: USER_SELECT_CORE,
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
      select: USER_SELECT_CORE,
    });
  }

  async createFW(supervisorId: string, orgId: string, dto: CreateFwDto) {
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
      where: { supervisorId, organizationId: orgId },
      select: { id: true, displayName: true, email: true, role: true, phone: true, isActive: true },
      orderBy: { createdAt: 'asc' },
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

  async update(id: string, orgId: string, actorId: string, dto: UpdateUserDto, actorRole?: string) {
    const target = await this.findOne(id, orgId);
    if (dto.role !== undefined && id === actorId) {
      throw new BadRequestException('ไม่สามารถเปลี่ยนสิทธิ์ของตนเองได้');
    }
    if (actorRole === 'CASE_MANAGER') {
      if (target.role !== 'CARE_GIVER' || target.supervisorId !== actorId) {
        throw new BadRequestException('CASE_MANAGER สามารถแก้ไขได้เฉพาะ CARE_GIVER ในทีมของตนเอง');
      }
      if (dto.role !== undefined || dto.isActive !== undefined) {
        throw new BadRequestException('CASE_MANAGER ไม่สามารถเปลี่ยนสิทธิ์หรือสถานะบัญชีได้');
      }
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: dto as any,
      select: USER_SELECT_CORE,
    });

    // Audit role changes (GUEST → real role = approval)
    if (dto.role && dto.role !== target.role) {
      const isApproval = target.role === 'GUEST';
      void this.audit.log({
        orgId,
        actorId,
        action: isApproval ? 'APPROVE_GUEST' : 'CHANGE_ROLE',
        entity: 'User',
        entityId: id,
        detail: `${target.displayName}: ${target.role} → ${dto.role}`,
      });
      if (isApproval && target.lineUserId) {
        void this.line.pushRoleApproval(target.lineUserId, {
          displayName: target.displayName,
          newRole: dto.role,
        });
      }
    }

    return updated;
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

  async resetPassword(id: string, orgId: string, actorId: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    }
    await this.findOne(id, orgId);
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    void this.audit.log({
      orgId,
      actorId,
      action: 'RESET_PASSWORD',
      entity: 'User',
      entityId: id,
      detail: `รีเซ็ตรหัสผ่านโดย SUPER_ADMIN`,
    });
  }

  async deactivate(id: string, orgId: string, actorId: string, actorRole?: string) {
    if (id === actorId) throw new BadRequestException('ไม่สามารถปิดบัญชีของตนเองได้');
    const target = await this.findOne(id, orgId);
    if (actorRole === 'CASE_MANAGER') {
      if (target.role !== 'CARE_GIVER' || target.supervisorId !== actorId) {
        throw new BadRequestException('CASE_MANAGER สามารถปิดบัญชีได้เฉพาะ CARE_GIVER ในทีมของตนเอง');
      }
    }
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, isActive: true },
    });
  }
}
