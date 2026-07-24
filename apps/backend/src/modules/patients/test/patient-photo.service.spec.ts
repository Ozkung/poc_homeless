import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PatientsService } from '../patients.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AesGcmService } from '../../../common/crypto/aes-gcm.service';
import { NotificationsService } from '../../notifications/notifications.service';

const mockPrisma: any = {
  patient: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};
const mockCrypto = { encrypt: jest.fn(), decrypt: jest.fn() };
const mockNotifications = { enqueueSosAlert: jest.fn() };

describe('PatientsService — updatePhoto authorization', () => {
  let service: PatientsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AesGcmService, useValue: mockCrypto },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get(PatientsService);
    jest.clearAllMocks();
  });

  describe('GUEST role', () => {
    it('allows upload when the guest is the one who reported the patient', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ reportedById: 'user1', organizationId: 'org1' });
      mockPrisma.patient.update.mockResolvedValue({});

      const result = await service.updatePhoto('p1', 'user1', 'GUEST', 'org1', '/uploads/patients/x.jpg');

      expect(result).toEqual({ photoUrl: '/uploads/patients/x.jpg' });
      expect(mockPrisma.patient.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { photoUrl: '/uploads/patients/x.jpg' },
      });
    });

    it('rejects upload when the guest did not report this patient', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ reportedById: 'someone-else', organizationId: 'org1' });

      await expect(
        service.updatePhoto('p1', 'user1', 'GUEST', 'org1', '/uploads/patients/x.jpg'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.patient.update).not.toHaveBeenCalled();
    });
  });

  describe('CASE_MANAGER / ADMIN / CARE_GIVER / MEDICAL_VOLUNTEER / SUPER_ADMIN roles', () => {
    it.each(['CASE_MANAGER', 'ADMIN', 'CARE_GIVER', 'MEDICAL_VOLUNTEER', 'SUPER_ADMIN'])(
      'allows %s to upload a photo for any patient in their org, regardless of reportedById',
      async (role) => {
        mockPrisma.patient.findUnique.mockResolvedValue({ reportedById: null, organizationId: 'org1' });
        mockPrisma.patient.update.mockResolvedValue({});

        const result = await service.updatePhoto('p1', 'some-user', role, 'org1', '/uploads/patients/x.jpg');

        expect(result).toEqual({ photoUrl: '/uploads/patients/x.jpg' });
        expect(mockPrisma.patient.update).toHaveBeenCalled();
      },
    );

    it('rejects when the patient belongs to a different organization', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ reportedById: null, organizationId: 'org2' });

      await expect(
        service.updatePhoto('p1', 'some-user', 'CASE_MANAGER', 'org1', '/uploads/patients/x.jpg'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.patient.update).not.toHaveBeenCalled();
    });

    it('rejects DOCTOR even when organizationId matches (not part of the org-scoped grant)', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ reportedById: null, organizationId: 'org1' });

      await expect(
        service.updatePhoto('p1', 'some-doctor', 'DOCTOR', 'org1', '/uploads/patients/x.jpg'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.patient.update).not.toHaveBeenCalled();
    });
  });

  it('throws NotFoundException when the patient does not exist', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null);

    await expect(
      service.updatePhoto('missing', 'user1', 'CASE_MANAGER', 'org1', '/uploads/patients/x.jpg'),
    ).rejects.toThrow(NotFoundException);
  });
});
