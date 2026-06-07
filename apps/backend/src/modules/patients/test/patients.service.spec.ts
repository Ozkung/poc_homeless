import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PatientsService } from '../patients.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AesGcmService } from '../../../common/crypto/aes-gcm.service';

const mockPrisma = {
  patient: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  activity: { findMany: jest.fn() },
  submission: { findMany: jest.fn() },
};

const mockCrypto = {
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => v.replace('enc:', '')),
};

describe('PatientsService', () => {
  let service: PatientsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AesGcmService, useValue: mockCrypto },
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
        hn: 'HN001',
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

      await service.create('org1', 'cm1', { name: 'Jane', hn: 'HN002' });

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
