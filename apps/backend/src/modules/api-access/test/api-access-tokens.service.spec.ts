import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ApiAccessService } from '../api-access.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { AuditLogService } from '../../audit-log/audit-log.service';

const mockPrisma: any = {
  apiAccessRequest: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  apiAccessToken: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
};
const mockMail = { sendApiAccessApproval: jest.fn(), sendApiAccessRejection: jest.fn() };
const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

describe('ApiAccessService — tokens', () => {
  let service: ApiAccessService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ApiAccessService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMail },
        { provide: AuditLogService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(ApiAccessService);
  });

  describe('listTokens', () => {
    it('returns all tokens with their request info', async () => {
      mockPrisma.apiAccessToken.findMany.mockResolvedValue([{ id: 'tok1', isRevoked: false }]);

      const result = await service.listTokens();

      expect(result).toEqual([{ id: 'tok1', isRevoked: false }]);
      expect(mockPrisma.apiAccessToken.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: expect.objectContaining({ request: expect.anything() }) }),
      );
      const selectArg = mockPrisma.apiAccessToken.findMany.mock.calls[0][0].select;
      expect(selectArg).not.toHaveProperty('tokenHash');
    });
  });

  describe('revokeToken', () => {
    it('marks a token revoked and sets revokedAt', async () => {
      mockPrisma.apiAccessToken.findUnique.mockResolvedValue({ id: 'tok1', isRevoked: false });
      mockPrisma.apiAccessToken.update.mockResolvedValue({ id: 'tok1', isRevoked: true });

      await service.revokeToken('tok1', 'admin1', 'org1');

      expect(mockPrisma.apiAccessToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tok1' }, data: expect.objectContaining({ isRevoked: true, revokedAt: expect.any(Date) }) }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'REVOKE_API_ACCESS_TOKEN', entityId: 'tok1' }));
    });

    it('throws NotFoundException for an unknown token id', async () => {
      mockPrisma.apiAccessToken.findUnique.mockResolvedValue(null);

      await expect(service.revokeToken('nope', 'admin1', 'org1')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.apiAccessToken.update).not.toHaveBeenCalled();
    });

    it('is idempotent — revoking an already-revoked token does not throw', async () => {
      mockPrisma.apiAccessToken.findUnique.mockResolvedValue({ id: 'tok1', isRevoked: true });
      mockPrisma.apiAccessToken.update.mockResolvedValue({ id: 'tok1', isRevoked: true });

      await expect(service.revokeToken('tok1', 'admin1', 'org1')).resolves.toBeDefined();
    });
  });
});
