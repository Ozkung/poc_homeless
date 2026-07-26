import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SseService } from '../../notifications/sse.service';

const mockTx = {
  user: { update: jest.fn(), delete: jest.fn() },
  patient: { updateMany: jest.fn() },
  activity: { updateMany: jest.fn() },
  submission: { updateMany: jest.fn() },
};
const mockPrisma: any = {
  user: { findUnique: jest.fn() },
  $transaction: jest.fn((cb: any) => cb(mockTx)),
};
const mockJwt = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };
const mockConfig = { get: jest.fn((key: string) => (key === 'jwt.expiresIn' ? '1h' : key === 'jwt.refreshExpiresIn' ? '30d' : '')) };
const mockSse = { emit: jest.fn() };
const mockRedis = { setex: jest.fn(), get: jest.fn(), del: jest.fn() };

describe('AuthService — linkRole', () => {
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

  it('moves the LINE link, reassigns created data, deletes the guest row, and returns a handoff code', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'guest1', role: 'GUEST', isActive: true,
        lineUserId: 'line-abc', lineDisplayName: 'Guest', linePictureUrl: 'pic.jpg',
      })
      .mockResolvedValueOnce({
        id: 'staff1', role: 'CASE_MANAGER', isActive: true,
        passwordHash: await bcrypt.hash('correct-password', 12),
      });

    const result = await service.linkRole('guest1', 'staff@example.com', 'correct-password');

    expect(result.code).toBeDefined();
    expect(mockTx.user.update).toHaveBeenCalledWith({ where: { id: 'guest1' }, data: { lineUserId: null } });
    expect(mockTx.user.update).toHaveBeenCalledWith({
      where: { id: 'staff1' },
      data: { lineUserId: 'line-abc', lineDisplayName: 'Guest', linePictureUrl: 'pic.jpg' },
    });
    expect(mockTx.patient.updateMany).toHaveBeenCalledWith({ where: { reportedById: 'guest1' }, data: { reportedById: 'staff1' } });
    expect(mockTx.activity.updateMany).toHaveBeenCalledWith({ where: { actorId: 'guest1' }, data: { actorId: 'staff1' } });
    expect(mockTx.submission.updateMany).toHaveBeenCalledWith({ where: { submittedById: 'guest1' }, data: { submittedById: 'staff1' } });
    expect(mockTx.user.delete).toHaveBeenCalledWith({ where: { id: 'guest1' } });
    expect(mockRedis.setex).toHaveBeenCalledWith(expect.stringContaining('liff-handoff:'), expect.any(Number), 'staff1');
  });

  it('rejects when the caller is not a GUEST', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'staff2', role: 'CASE_MANAGER', isActive: true });

    await expect(service.linkRole('staff2', 'staff@example.com', 'whatever1')).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an unknown target email', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: 'guest1', role: 'GUEST', isActive: true })
      .mockResolvedValueOnce(null);

    await expect(service.linkRole('guest1', 'nope@example.com', 'whatever1')).rejects.toThrow(UnauthorizedException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an incorrect password', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: 'guest1', role: 'GUEST', isActive: true })
      .mockResolvedValueOnce({ id: 'staff1', role: 'CASE_MANAGER', isActive: true, passwordHash: await bcrypt.hash('correct-password', 12) });

    await expect(service.linkRole('guest1', 'staff@example.com', 'wrong-password')).rejects.toThrow(UnauthorizedException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects linking to the caller\'s own account', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: 'guest1', role: 'GUEST', isActive: true })
      .mockResolvedValueOnce({ id: 'guest1', role: 'GUEST', isActive: true, passwordHash: await bcrypt.hash('correct-password', 12) });

    await expect(service.linkRole('guest1', 'self@example.com', 'correct-password')).rejects.toThrow(BadRequestException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
