import { Test } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { SseService } from '../../notifications/sse.service';

const hash = (p: string) => bcrypt.hash(p, 10);

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};
const mockRedis = { setex: jest.fn(), del: jest.fn(), get: jest.fn() };
const mockJwt = { signAsync: jest.fn().mockResolvedValue('tok') };
const mockConfig = { get: jest.fn().mockReturnValue('15m') };
const mockSse = { emit: jest.fn(), getSubject: jest.fn() };

describe('AuthService — me operations', () => {
  let service: AuthService;

  beforeEach(async () => {
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
    jest.clearAllMocks();
  });

  describe('getMe', () => {
    it('returns user without passwordHash', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1', email: 'a@b.com', displayName: 'Admin', role: 'ADMIN',
        phone: '0812345678', gender: 'MALE', avatarUrl: null, lineUserId: null,
        isActive: true, createdAt: new Date(),
      });
      const result = await service.getMe('u1', 'org1');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe('a@b.com');
    });
  });

  describe('updateMe', () => {
    it('updates displayName and phone without touching email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1', email: 'a@b.com', passwordHash: await hash('pass'), organizationId: 'org1',
      });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', displayName: 'New', phone: '099' });
      await service.updateMe('u1', 'org1', { displayName: 'New', phone: '099' });
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ displayName: 'New', phone: '099' }) }),
      );
    });

    it('requires currentPassword when changing email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1', email: 'a@b.com', passwordHash: await hash('correctPassword'), organizationId: 'org1',
      });
      await expect(
        service.updateMe('u1', 'org1', { email: 'new@b.com', currentPassword: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws if email provided without currentPassword', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1', email: 'a@b.com', passwordHash: await hash('pass'), organizationId: 'org1',
      });
      await expect(
        service.updateMe('u1', 'org1', { email: 'new@b.com' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('changePassword', () => {
    it('updates password hash when currentPassword is correct', async () => {
      const pw = await hash('OldPass1!');
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u1', passwordHash: pw, organizationId: 'org1' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1' });
      await service.changePassword('u1', 'org1', 'OldPass1!', 'NewPass2!');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ passwordHash: expect.any(String) }) }),
      );
    });

    it('throws UnauthorizedException on wrong current password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1', passwordHash: await hash('correct'), organizationId: 'org1',
      });
      await expect(service.changePassword('u1', 'org1', 'wrong', 'NewPass2!')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('unlinkLine', () => {
    it('sets lineUserId to null', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u1', organizationId: 'org1' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', lineUserId: null });
      await service.unlinkLine('u1', 'org1');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { lineUserId: null } }),
      );
    });
  });
});
