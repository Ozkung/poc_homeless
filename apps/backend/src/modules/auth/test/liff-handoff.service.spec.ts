import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SseService } from '../../notifications/sse.service';

const mockPrisma: any = { user: { findUnique: jest.fn() } };
const mockJwt = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };
const mockConfig = { get: jest.fn((key: string) => (key === 'jwt.expiresIn' ? '1h' : key === 'jwt.refreshExpiresIn' ? '30d' : '')) };
const mockSse = { emit: jest.fn() };
const mockRedis = { setex: jest.fn(), get: jest.fn(), del: jest.fn() };

describe('AuthService — LIFF handoff', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getRedisConnectionToken('default'), useValue: mockRedis },
        { provide: SseService, useValue: mockSse },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  describe('createLiffHandoffCode', () => {
    it('generates a code and stores the userId in Redis with a short TTL', async () => {
      const result = await service.createLiffHandoffCode('user1');

      expect(result.code).toBeDefined();
      expect(typeof result.code).toBe('string');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('liff-handoff:'),
        expect.any(Number),
        'user1',
      );
      const [, ttl] = mockRedis.setex.mock.calls[0];
      expect(ttl).toBeLessThanOrEqual(60);
    });
  });

  describe('exchangeLiffHandoffCode', () => {
    it('issues fresh tokens for a valid, unexpired code and deletes it (single-use)', async () => {
      mockRedis.get.mockResolvedValue('user1');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user1', email: 'guest@example.com', role: 'GUEST',
        organizationId: 'org1', displayName: 'Guest One', avatarUrl: null, isActive: true,
      });

      const result = await service.exchangeLiffHandoffCode('abc123');

      expect(result.accessToken).toBe('signed-jwt');
      expect(result.refreshToken).toBeDefined();
      expect(result.role).toBe('GUEST');
      expect(mockRedis.del).toHaveBeenCalledWith(expect.stringContaining('liff-handoff:abc123'));
    });

    it('rejects an unknown or expired code', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.exchangeLiffHandoffCode('bad-code')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a code for a deactivated user', async () => {
      mockRedis.get.mockResolvedValue('user1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user1', isActive: false });

      await expect(service.exchangeLiffHandoffCode('abc123')).rejects.toThrow(UnauthorizedException);
    });
  });
});
