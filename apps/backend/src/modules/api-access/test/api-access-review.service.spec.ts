import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiAccessService } from '../api-access.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { AuditLogService } from '../../audit-log/audit-log.service';

const mockPrisma: any = {
  apiAccessRequest: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  apiAccessToken: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
};
const mockMail = { sendApiAccessApproval: jest.fn(), sendApiAccessRejection: jest.fn() };
const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

describe('ApiAccessService — review', () => {
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

  describe('approve', () => {
    it('creates a token, hashes it, never returns the hash as the plaintext, and emails the requester', async () => {
      mockPrisma.apiAccessRequest.findUnique.mockResolvedValue({
        id: 'req1', status: 'PENDING', email: 'r@example.com',
        requestedLevel: 'VIEW', requestedScope: { Patient: ['hn'] },
      });
      mockPrisma.apiAccessToken.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'tok1', ...data }));
      mockPrisma.apiAccessRequest.update.mockResolvedValue({ id: 'req1', status: 'APPROVED' });

      const result = await service.approve('req1', 'admin1', 'org1', {});

      expect(result.plaintextToken).toBeDefined();
      expect(typeof result.plaintextToken).toBe('string');
      expect(result.plaintextToken.length).toBeGreaterThanOrEqual(32);

      const createCall = mockPrisma.apiAccessToken.create.mock.calls[0][0];
      expect(createCall.data.tokenHash).not.toBe(result.plaintextToken);
      expect(createCall.data.tokenHash).toHaveLength(64); // sha256 hex digest

      expect(mockPrisma.apiAccessRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'req1' }, data: expect.objectContaining({ status: 'APPROVED', reviewedById: 'admin1' }) }),
      );
      expect(mockMail.sendApiAccessApproval).toHaveBeenCalledWith('r@example.com', expect.objectContaining({ token: result.plaintextToken }));
    });

    it('defaults granted level/scope to the requested values when not overridden', async () => {
      mockPrisma.apiAccessRequest.findUnique.mockResolvedValue({
        id: 'req1', status: 'PENDING', email: 'r@example.com',
        requestedLevel: 'VIEW', requestedScope: { Patient: ['hn'] },
      });
      mockPrisma.apiAccessToken.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'tok1', ...data }));
      mockPrisma.apiAccessRequest.update.mockResolvedValue({ id: 'req1' });

      await service.approve('req1', 'admin1', 'org1', {});

      const createCall = mockPrisma.apiAccessToken.create.mock.calls[0][0];
      expect(createCall.data.grantedLevel).toBe('VIEW');
      expect(createCall.data.grantedScope).toEqual({ Patient: ['hn'] });
    });

    it('allows SuperAdmin to narrow the granted scope', async () => {
      mockPrisma.apiAccessRequest.findUnique.mockResolvedValue({
        id: 'req1', status: 'PENDING', email: 'r@example.com',
        requestedLevel: 'CREATE_UPDATE', requestedScope: { Patient: ['hn', 'age'] },
      });
      mockPrisma.apiAccessToken.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'tok1', ...data }));
      mockPrisma.apiAccessRequest.update.mockResolvedValue({ id: 'req1' });

      await service.approve('req1', 'admin1', 'org1', { grantedLevel: 'VIEW', grantedScope: { Patient: ['hn'] } });

      const createCall = mockPrisma.apiAccessToken.create.mock.calls[0][0];
      expect(createCall.data.grantedLevel).toBe('VIEW');
      expect(createCall.data.grantedScope).toEqual({ Patient: ['hn'] });
    });

    it('rejects a narrowed scope containing an entity/column outside the catalog', async () => {
      mockPrisma.apiAccessRequest.findUnique.mockResolvedValue({
        id: 'req1', status: 'PENDING', email: 'r@example.com',
        requestedLevel: 'VIEW', requestedScope: { Patient: ['hn'] },
      });

      await expect(
        service.approve('req1', 'admin1', 'org1', { grantedScope: { NotAModel: ['x'] } }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.apiAccessToken.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the request is not PENDING', async () => {
      mockPrisma.apiAccessRequest.findUnique.mockResolvedValue({ id: 'req1', status: 'APPROVED' });

      await expect(service.approve('req1', 'admin1', 'org1', {})).rejects.toThrow(NotFoundException);
      expect(mockPrisma.apiAccessToken.create).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('marks the request REJECTED and emails the requester with the reason', async () => {
      mockPrisma.apiAccessRequest.findUnique.mockResolvedValue({ id: 'req1', status: 'PENDING', email: 'r@example.com' });
      mockPrisma.apiAccessRequest.update.mockResolvedValue({ id: 'req1', status: 'REJECTED' });

      await service.reject('req1', 'admin1', 'org1', { reason: 'ข้อมูลไม่ครบถ้วน' });

      expect(mockPrisma.apiAccessRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'req1' }, data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'ข้อมูลไม่ครบถ้วน' }) }),
      );
      expect(mockMail.sendApiAccessRejection).toHaveBeenCalledWith('r@example.com', { reason: 'ข้อมูลไม่ครบถ้วน' });
    });

    it('throws NotFoundException when the request is not PENDING', async () => {
      mockPrisma.apiAccessRequest.findUnique.mockResolvedValue({ id: 'req1', status: 'REJECTED' });

      await expect(service.reject('req1', 'admin1', 'org1', {})).rejects.toThrow(NotFoundException);
    });
  });
});
