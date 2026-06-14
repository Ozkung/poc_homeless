import { Test } from '@nestjs/testing';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { BadRequestException } from '@nestjs/common';

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockAudit = {
  log: jest.fn().mockResolvedValue(undefined),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(UsersService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('hashes password and saves user', async () => {
      mockPrisma.user.create.mockResolvedValue({ id: 'u1', email: 'new@b.com', displayName: 'New', role: 'CASE_MANAGER', createdAt: new Date() });
      const result = await service.create({
        email: 'new@b.com', displayName: 'New', password: 'Passw0rd!', role: 'CASE_MANAGER' as any, orgId: 'org1',
      });
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'new@b.com', passwordHash: expect.any(String) }),
        }),
      );
      expect(result.email).toBe('new@b.com');
    });
  });

  describe('deactivate', () => {
    it('sets isActive to false', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u2', organizationId: 'org1' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u2', isActive: false });
      await service.deactivate('u2', 'org1', 'u1-actor');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });

    it('throws BadRequestException when deactivating own account', async () => {
      await expect(service.deactivate('u1', 'org1', 'u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('throws when SA tries to change their own role', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u1', organizationId: 'org1' });
      await expect(
        service.update('u1', 'org1', 'u1', { role: 'CASE_MANAGER' as any }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
