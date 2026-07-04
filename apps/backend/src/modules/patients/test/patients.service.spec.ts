import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PatientsService } from '../patients.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AesGcmService } from '../../../common/crypto/aes-gcm.service';
import { NotificationsService } from '../../notifications/notifications.service';

const mockPrisma = {
  patient: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn().mockResolvedValue(null), // generateHN uniqueness check
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  activity: { findMany: jest.fn(), create: jest.fn() },
  submission: { findMany: jest.fn() },
  alert: { create: jest.fn() },
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  carePlanItem: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  eventTask: { findUnique: jest.fn() },
};

const mockCrypto = {
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => v.replace('enc:', '')),
};

const mockNotifications = {
  enqueueSosAlert: jest.fn(),
};

describe('PatientsService', () => {
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
    // Reset encrypt/decrypt to default behavior after clearAllMocks
    mockCrypto.encrypt.mockImplementation((v: string) => `enc:${v}`);
    mockCrypto.decrypt.mockImplementation((v: string) => v.replace('enc:', ''));
  });

  describe('create()', () => {
    it('encrypts name before persisting and returns decrypted name in result', async () => {
      const rawPatient = {
        id: 'p1',
        organizationId: 'org1',
        caseManagerId: 'cm1',
        nameEnc: 'enc:John Doe',
        hn: 'HN001',
        age: 45,
        gender: 'MALE',
        status: 'PENDING',
        conditions: [],
        locationText: null,
      };
      mockPrisma.patient.create.mockResolvedValue(rawPatient);

      const result = await service.create('org1', 'cm1', {
        name: 'John Doe',
        age: 45,
        gender: 'MALE',
      });

      // Verify encryption was applied to the plain name before DB write
      expect(mockCrypto.encrypt).toHaveBeenCalledWith('John Doe');
      expect(mockPrisma.patient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nameEnc: 'enc:John Doe' }),
        }),
      );

      // Verify the returned object contains the decrypted name, not the encrypted blob
      expect(result.name).toBe('John Doe');
      expect(result.nameEnc).toBeUndefined();
    });

    it('sets default status to PENDING when status is not provided', async () => {
      const rawPatient = {
        id: 'p2',
        organizationId: 'org1',
        caseManagerId: 'cm1',
        nameEnc: 'enc:Jane',
        hn: 'HN002',
        status: 'PENDING',
        conditions: [],
      };
      mockPrisma.patient.create.mockResolvedValue(rawPatient);

      await service.create('org1', 'cm1', { name: 'Jane' });

      expect(mockPrisma.patient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });
  });

  describe('findOne()', () => {
    it('returns decrypted patient when found within the same org', async () => {
      const rawPatient = {
        id: 'p1',
        organizationId: 'org1',
        nameEnc: 'enc:John Doe',
        hn: 'HN001',
      };
      mockPrisma.patient.findFirst.mockResolvedValue(rawPatient);

      const result = await service.findOne('p1', 'org1');

      expect(mockPrisma.patient.findFirst).toHaveBeenCalledWith({
        where: { id: 'p1', organizationId: 'org1' },
      });
      expect(result.name).toBe('John Doe');
      expect(result.nameEnc).toBeUndefined();
    });

    it('throws NotFoundException when patient belongs to a different org', async () => {
      // Prisma returns null when the WHERE clause finds no match (org scoping)
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.findOne('p1', 'wrong-org')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when patient id does not exist', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', 'org1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    it('encrypts name when name is provided', async () => {
      const existing = {
        id: 'p1',
        organizationId: 'org1',
        nameEnc: 'enc:John Doe',
        hn: 'HN001',
      };
      const updated = {
        id: 'p1',
        organizationId: 'org1',
        nameEnc: 'enc:Jane Doe',
        hn: 'HN001',
      };
      mockPrisma.patient.findFirst.mockResolvedValue(existing);
      mockPrisma.patient.update.mockResolvedValue(updated);

      const result = await service.update('p1', 'org1', { name: 'Jane Doe', age: 30 });

      // name should be encrypted and stored as nameEnc; plain name key removed
      expect(mockCrypto.encrypt).toHaveBeenCalledWith('Jane Doe');
      expect(mockPrisma.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({ nameEnc: 'enc:Jane Doe', age: 30 }),
        }),
      );
      // The returned object must NOT contain `name` as a raw Prisma field
      expect(mockPrisma.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ name: expect.anything() }),
        }),
      );
      expect(result.name).toBe('Jane Doe');
      expect(result.nameEnc).toBeUndefined();
    });

    it('updates without encrypting when name is absent', async () => {
      const existing = {
        id: 'p1',
        organizationId: 'org1',
        nameEnc: 'enc:John Doe',
        hn: 'HN001',
        age: 40,
      };
      const updated = { ...existing, age: 50 };
      mockPrisma.patient.findFirst.mockResolvedValue(existing);
      mockPrisma.patient.update.mockResolvedValue(updated);

      const result = await service.update('p1', 'org1', { age: 50 });

      expect(mockCrypto.encrypt).not.toHaveBeenCalled();
      expect(mockPrisma.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({ age: 50 }),
        }),
      );
      expect(result.name).toBe('John Doe');
    });

    it('throws NotFoundException for wrong org', async () => {
      // findOne returns null when org doesn't match, triggering NotFoundException
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.update('p1', 'wrong-org', { age: 50 })).rejects.toThrow(NotFoundException);
      expect(mockPrisma.patient.update).not.toHaveBeenCalled();
    });
  });

  describe('guestReport()', () => {
    it('creates a PENDING patient using actor preferredZoneId and encrypted alias', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ preferredZoneId: 'zone-abc' });
      mockPrisma.patient.findUnique.mockResolvedValue(null); // HN unique check
      mockPrisma.patient.create.mockResolvedValue({
        id: 'p99', hn: 'HN000000000099', nameEnc: 'enc:Stranger',
        organizationId: 'org1', caseManagerId: null, age: null, gender: null,
        status: 'PENDING', conditions: [], initialComplaint: 'Fever',
        locationText: 'Under bridge', phone: null, birthDate: null,
        nationalIdEnc: null, followUpTarget: null, zoneId: 'zone-abc',
        createdAt: new Date(), updatedAt: new Date(),
      });

      const result = await service.guestReport('actor1', 'org1', {
        alias: 'Stranger',
        locationText: 'Under bridge',
        initialComplaint: 'Fever',
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'actor1' },
        select: { preferredZoneId: true },
      });
      expect(mockCrypto.encrypt).toHaveBeenCalledWith('Stranger');
      expect(mockPrisma.patient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org1',
            status: 'PENDING',
            zoneId: 'zone-abc',
          }),
        }),
      );
      expect(result).toEqual({ id: 'p99', hn: 'HN000000000099' });
    });

    it('creates patient with null zoneId when actor has no preferredZoneId', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ preferredZoneId: null });
      mockPrisma.patient.findUnique.mockResolvedValue(null);
      mockPrisma.patient.create.mockResolvedValue({
        id: 'p100', hn: 'HN000000000100', nameEnc: 'enc:Unknown',
        organizationId: 'org1', caseManagerId: null, age: null, gender: null,
        status: 'PENDING', conditions: [], initialComplaint: 'Unknown',
        locationText: 'Park', phone: null, birthDate: null,
        nationalIdEnc: null, followUpTarget: null, zoneId: null,
        createdAt: new Date(), updatedAt: new Date(),
      });

      const result = await service.guestReport('actor2', 'org1', {
        alias: 'Unknown',
        locationText: 'Park',
        initialComplaint: 'Unknown',
      });

      expect(mockPrisma.patient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ zoneId: null }),
        }),
      );
      expect(result).toEqual({ id: 'p100', hn: 'HN000000000100' });
    });
  });

  describe('findAll()', () => {
    it('decrypts nameEnc for every patient in the list', async () => {
      const rawPatients = [
        { id: 'p1', organizationId: 'org1', nameEnc: 'enc:Alice', hn: 'HN001' },
        { id: 'p2', organizationId: 'org1', nameEnc: 'enc:Bob', hn: 'HN002' },
      ];
      mockPrisma.patient.findMany.mockResolvedValue(rawPatients);

      const results = await service.findAll('org1');

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Alice');
      expect(results[0].nameEnc).toBeUndefined();
      expect(results[1].name).toBe('Bob');
      expect(results[1].nameEnc).toBeUndefined();
    });

    it('returns an empty array when org has no patients', async () => {
      mockPrisma.patient.findMany.mockResolvedValue([]);

      const results = await service.findAll('org1');

      expect(results).toEqual([]);
    });
  });
});
