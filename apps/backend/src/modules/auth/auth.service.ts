import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { InjectRedis } from '@nestjs-modules/ioredis';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    @InjectRedis() private redis: Redis,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens(user.id, user.email, user.role, user.organizationId);
  }

  async refresh(refreshToken: string) {
    const key = `refresh:${refreshToken}`;
    const raw = await this.redis.get(key);
    if (!raw) throw new UnauthorizedException('Invalid refresh token');

    await this.redis.del(key);
    const { userId } = JSON.parse(raw) as { userId: string };

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException();

    return this.issueTokens(user.id, user.email, user.role, user.organizationId);
  }

  async logout(refreshToken: string) {
    await this.redis.del(`refresh:${refreshToken}`);
  }

  async verifyLiffToken(idToken: string) {
    const channelId = this.config.get<string>('line.liffId');
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `id_token=${idToken}&client_id=${channelId}`,
    });
    if (!res.ok) throw new UnauthorizedException('Invalid LIFF token');
    const profile = await res.json() as { sub: string };

    const user = await this.prisma.user.findUnique({ where: { lineUserId: profile.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('Line user not linked');

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role, orgId: user.organizationId },
      { expiresIn: this.config.get('jwt.expiresIn') },
    );
    return { accessToken };
  }

  private async issueTokens(userId: string, email: string, role: string, orgId: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, role, orgId },
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
}
