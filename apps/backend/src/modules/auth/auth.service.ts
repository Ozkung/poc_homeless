import { BadRequestException, Injectable, NotFoundException, UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { UpdateMeDto } from './dto/update-me.dto';
import { SseService } from '../notifications/sse.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    @InjectRedis() private redis: Redis,
    private sseService: SseService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens(user.id, user.email, user.role, user.organizationId, user.displayName, user.avatarUrl ?? null);
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Invalid refresh token');
    const key = `refresh:${refreshToken}`;
    const raw = await this.redis.get(key);
    if (!raw) throw new UnauthorizedException('Invalid refresh token');

    await this.redis.del(key);
    const { userId } = JSON.parse(raw) as { userId: string };

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException();

    return this.issueTokens(user.id, user.email, user.role, user.organizationId, user.displayName, user.avatarUrl ?? null);
  }

  async logout(refreshToken: string) {
    if (!refreshToken) return;
    await this.redis.del(`refresh:${refreshToken}`);
  }

  private async verifyLineIdToken(idToken: string): Promise<{ sub: string; name?: string; picture?: string }> {
    const clientId = this.config.get<string>('line.channelId') ?? '';
    const body = new URLSearchParams({ id_token: idToken, client_id: clientId });
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) throw new UnauthorizedException('Invalid LIFF token');
    return res.json() as Promise<{ sub: string; name?: string; picture?: string }>;
  }

  async verifyLiffToken(idToken: string) {
    const profile = await this.verifyLineIdToken(idToken);
    const user = await this.prisma.user.findUnique({ where: { lineUserId: profile.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('Line user not linked');

    // Best-effort: sync LINE profile — non-fatal if migration not yet applied
    if (profile.name || profile.picture) {
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          ...(profile.name    && { lineDisplayName: profile.name }),
          ...(profile.picture && { linePictureUrl: profile.picture }),
        },
      }).catch(() => {});
    }

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role, orgId: user.organizationId },
      { expiresIn: this.config.get('jwt.expiresIn') },
    );
    return { accessToken };
  }

  async guestRegister(idToken: string, data: {
    firstName: string; lastName: string;
    email: string; phone?: string; zoneId?: string;
  }) {
    const profile = await this.verifyLineIdToken(idToken);

    const existing = await this.prisma.user.findUnique({ where: { lineUserId: profile.sub } });
    if (existing) throw new ConflictException('LINE account already registered');

    const emailExists = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (emailExists) throw new ConflictException('Email already in use');

    const org = await this.prisma.organization.findFirst();
    if (!org) throw new ForbiddenException('No organization found');

    const passwordHash = await bcrypt.hash(randomUUID(), 12);
    const user = await this.prisma.user.create({
      data: {
        organizationId: org.id,
        email: data.email,
        passwordHash,
        role: 'GUEST',
        displayName: `${data.firstName} ${data.lastName}`,
        lineUserId: profile.sub,
        lineDisplayName: profile.name ?? null,
        linePictureUrl: profile.picture ?? null,
        phone: data.phone,
        preferredZoneId: data.zoneId ?? null,
      },
    });

    this.sseService.emit(org.id, ['CASE_MANAGER', 'DOCTOR'], {
      type: 'guest_joined',
      name: `${data.firstName} ${data.lastName}`,
      role: 'GUEST',
    });

    return this.issueTokens(user.id, user.email, user.role, user.organizationId, user.displayName, user.avatarUrl ?? null);
  }

  async linkLine(idToken: string, email: string, password: string) {
    const profile = await this.verifyLineIdToken(idToken);

    const alreadyLinked = await this.prisma.user.findUnique({ where: { lineUserId: profile.sub } });
    if (alreadyLinked) throw new ConflictException('LINE account already linked to another user');

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    const ALLOWED_ROLES = ['GUEST', 'CASE_MANAGER', 'CARE_GIVER'];
    if (!ALLOWED_ROLES.includes(user.role)) {
      throw new ForbiddenException('บัญชีนี้ไม่รองรับการผูก LINE');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lineUserId: profile.sub,
        lineDisplayName: profile.name ?? null,
        linePictureUrl: profile.picture ?? null,
      },
    });

    this.sseService.emit(user.organizationId, ['CASE_MANAGER', 'DOCTOR'], {
      type: 'guest_joined',
      name: user.displayName,
      role: user.role,
    });

    return this.issueTokens(user.id, user.email, user.role, user.organizationId, user.displayName, user.avatarUrl ?? null);
  }

  async getPublicZones() {
    return this.prisma.zone.findMany({
      select: { id: true, name: true, color: true, description: true },
      orderBy: { name: 'asc' },
    });
  }

  async setup(orgName: string, adminName: string, adminEmail: string, adminPassword: string) {
    const existingAdmin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (existingAdmin) throw new ConflictException('System already set up');

    const org = await this.prisma.organization.create({ data: { name: orgName } });
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await this.prisma.user.create({
      data: {
        organizationId: org.id,
        email: adminEmail,
        passwordHash,
        role: 'ADMIN',
        displayName: adminName,
      },
    });
    return { message: 'Setup complete' };
  }

  private async issueTokens(userId: string, email: string, role: string, orgId: string, displayName: string, avatarUrl: string | null) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, role, orgId, displayName, avatarUrl },
      { expiresIn: this.config.get('jwt.expiresIn') },
    );

    const refreshToken = randomUUID();
    const ttlSeconds = this.parseTtl(this.config.get<string>('jwt.refreshExpiresIn') ?? '7d');
    await this.redis.setex(`refresh:${refreshToken}`, ttlSeconds, JSON.stringify({ userId }));

    return { accessToken, refreshToken, role };
  }

  private parseTtl(expiry: string): number {
    if (expiry.endsWith('d')) return parseInt(expiry) * 86400;
    if (expiry.endsWith('h')) return parseInt(expiry) * 3600;
    if (expiry.endsWith('m')) return parseInt(expiry) * 60;
    return parseInt(expiry);
  }

  async getMe(userId: string, orgId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: orgId },
      select: {
        id: true, email: true, displayName: true, role: true,
        phone: true, gender: true, avatarUrl: true,
        lineUserId: true, isActive: true, createdAt: true, birthDate: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateMe(userId: string, orgId: string, dto: UpdateMeDto) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
    if (!user) throw new NotFoundException('User not found');

    const { email, currentPassword, birthDate, ...rest } = dto;
    const updateData: Record<string, unknown> = { ...rest };
    if (birthDate !== undefined) {
      updateData.birthDate = birthDate ? new Date(birthDate) : null;
    }

    if (email) {
      if (!currentPassword) throw new BadRequestException('กรุณายืนยันรหัสผ่านก่อนเปลี่ยน email');
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) throw new UnauthorizedException('รหัสผ่านไม่ถูกต้อง');
      updateData.email = email;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData as any,
      select: { id: true, email: true, displayName: true, phone: true, gender: true, avatarUrl: true, role: true, birthDate: true },
    });
  }

  async changePassword(userId: string, orgId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
    if (!user) throw new NotFoundException('User not found');
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('รหัสผ่านไม่ถูกต้อง');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async unlinkLine(userId: string, orgId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.user.update({ where: { id: userId }, data: { lineUserId: null } });
  }

  async saveAvatarUrl(userId: string, orgId: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: { id: true, avatarUrl: true },
    });
  }
}
