import { Test } from '@nestjs/testing';
import { ExpenseClaimsService } from '../expense-claims.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockPrisma: any = {
  expenseClaim: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  patient: { findFirst: jest.fn() },
  user: { findFirst: jest.fn() },
};

const mockAuditLog = {
  log: jest.fn().mockResolvedValue(undefined),
};

describe('ExpenseClaimsService', () => {
  let service: ExpenseClaimsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ExpenseClaimsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile();
    service = module.get(ExpenseClaimsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates a SELF claim without patient/payee lookups', async () => {
      mockPrisma.expenseClaim.create.mockResolvedValue({ id: 'claim1', amount: 500 });

      await service.create('org1', 'user1', 'CARE_GIVER', {
        requestDate: '2026-07-23', amount: 500, description: 'ค่าเดินทาง', payeeType: 'SELF',
      } as any);

      expect(mockPrisma.patient.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.expenseClaim.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org1', requestedById: 'user1', amount: 500,
            payeeType: 'SELF', patientId: null, payeeId: null,
          }),
        }),
      );
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org1', actorId: 'user1', action: 'SUBMIT_CLAIM', entity: 'ExpenseClaim', entityId: 'claim1' }),
      );
    });

    it('creates a PATIENT claim after validating the patient exists in the org', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue({ id: 'p1' });
      mockPrisma.expenseClaim.create.mockResolvedValue({ id: 'claim2', amount: 300 });

      await service.create('org1', 'user1', 'CARE_GIVER', {
        requestDate: '2026-07-23', amount: 300, description: 'ค่ายา', payeeType: 'PATIENT', patientId: 'p1',
      } as any);

      expect(mockPrisma.patient.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1', organizationId: 'org1' } }),
      );
      expect(mockPrisma.expenseClaim.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ payeeType: 'PATIENT', patientId: 'p1', payeeId: null }) }),
      );
    });

    it('throws BadRequestException when payeeType PATIENT but patientId not found in org', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.create('org1', 'user1', 'CARE_GIVER', {
        requestDate: '2026-07-23', amount: 300, description: 'ค่ายา', payeeType: 'PATIENT', patientId: 'bad-id',
      } as any)).rejects.toThrow(BadRequestException);

      expect(mockPrisma.expenseClaim.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a CARE_GIVER requester sets payeeType CARE_GIVER', async () => {
      await expect(service.create('org1', 'user1', 'CARE_GIVER', {
        requestDate: '2026-07-23', amount: 300, description: 'ค่าเดินทาง', payeeType: 'CARE_GIVER', payeeId: 'cg2',
      } as any)).rejects.toThrow(BadRequestException);

      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.expenseClaim.create).not.toHaveBeenCalled();
    });

    it('creates a CARE_GIVER claim for a CASE_MANAGER requester after validating the payee', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'cg2', role: 'CARE_GIVER' });
      mockPrisma.expenseClaim.create.mockResolvedValue({ id: 'claim3', amount: 1000 });

      await service.create('org1', 'cm1', 'CASE_MANAGER', {
        requestDate: '2026-07-23', amount: 1000, description: 'ค่าเดินทางของทีม', payeeType: 'CARE_GIVER', payeeId: 'cg2',
      } as any);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cg2', organizationId: 'org1', role: 'CARE_GIVER' } }),
      );
      expect(mockPrisma.expenseClaim.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ payeeType: 'CARE_GIVER', payeeId: 'cg2', patientId: null }) }),
      );
    });

    it('throws BadRequestException when payeeType CARE_GIVER but payeeId not a Care Giver in org', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.create('org1', 'cm1', 'CASE_MANAGER', {
        requestDate: '2026-07-23', amount: 1000, description: 'ค่าเดินทาง', payeeType: 'CARE_GIVER', payeeId: 'bad-id',
      } as any)).rejects.toThrow(BadRequestException);

      expect(mockPrisma.expenseClaim.create).not.toHaveBeenCalled();
    });
  });

  describe('findMine', () => {
    it('returns claims filtered by requestedById, newest first', async () => {
      mockPrisma.expenseClaim.findMany.mockResolvedValue([{ id: 'claim1' }]);

      const result = await service.findMine('user1');

      expect(mockPrisma.expenseClaim.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { requestedById: 'user1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual([{ id: 'claim1' }]);
    });
  });

  describe('findAll', () => {
    it('returns all org claims when no status filter given', async () => {
      mockPrisma.expenseClaim.findMany.mockResolvedValue([]);

      await service.findAll('org1');

      expect(mockPrisma.expenseClaim.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org1' } }),
      );
    });

    it('filters by status when provided', async () => {
      mockPrisma.expenseClaim.findMany.mockResolvedValue([]);

      await service.findAll('org1', 'PENDING');

      expect(mockPrisma.expenseClaim.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org1', status: 'PENDING' } }),
      );
    });
  });

  describe('review', () => {
    it('approves a pending claim and logs APPROVE_CLAIM', async () => {
      mockPrisma.expenseClaim.findFirst.mockResolvedValue({ id: 'claim1', amount: 500, status: 'PENDING' });
      mockPrisma.expenseClaim.update.mockResolvedValue({ id: 'claim1', status: 'APPROVED' });

      await service.review('claim1', 'sa1', 'org1', { status: 'APPROVED', reviewNote: 'โอนแล้ว' });

      expect(mockPrisma.expenseClaim.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'claim1', organizationId: 'org1', status: 'PENDING' } }),
      );
      expect(mockPrisma.expenseClaim.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'claim1' },
          data: { status: 'APPROVED', reviewedById: 'sa1', reviewNote: 'โอนแล้ว' },
        }),
      );
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org1', actorId: 'sa1', action: 'APPROVE_CLAIM', entity: 'ExpenseClaim', entityId: 'claim1' }),
      );
    });

    it('rejects a pending claim and logs REJECT_CLAIM', async () => {
      mockPrisma.expenseClaim.findFirst.mockResolvedValue({ id: 'claim2', amount: 200, status: 'PENDING' });
      mockPrisma.expenseClaim.update.mockResolvedValue({ id: 'claim2', status: 'REJECTED' });

      await service.review('claim2', 'sa1', 'org1', { status: 'REJECTED' });

      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REJECT_CLAIM', entityId: 'claim2' }),
      );
    });

    it('throws NotFoundException when claim is not pending or does not exist', async () => {
      mockPrisma.expenseClaim.findFirst.mockResolvedValue(null);

      await expect(service.review('bad-id', 'sa1', 'org1', { status: 'APPROVED' }))
        .rejects.toThrow(NotFoundException);

      expect(mockPrisma.expenseClaim.update).not.toHaveBeenCalled();
    });
  });
});
