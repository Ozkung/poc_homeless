import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string) {
    return this.prisma.user.findMany({
      where: { organizationId: orgId },
      select: { id: true, email: true, displayName: true, role: true, isActive: true, createdAt: true },
    });
  }

  async findOne(id: string, orgId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, email: true, displayName: true, role: true, isActive: true, lineUserId: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(data: { email: string; password: string; displayName: string; role: string; orgId: string }) {
    const passwordHash = await bcrypt.hash(data.password, 12);
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        displayName: data.displayName,
        role: data.role as any,
        organizationId: data.orgId,
      },
      select: { id: true, email: true, displayName: true, role: true, createdAt: true },
    });
  }

  async update(id: string, orgId: string, data: Partial<{ displayName: string; isActive: boolean }>) {
    await this.findOne(id, orgId);
    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, displayName: true, role: true, isActive: true },
    });
  }
}
