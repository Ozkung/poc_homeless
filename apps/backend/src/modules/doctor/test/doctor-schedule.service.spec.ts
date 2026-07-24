import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DoctorService } from '../doctor.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AesGcmService } from '../../../common/crypto/aes-gcm.service';

const mockPrisma: any = {
  doctorSchedule: {
    create: jest.fn(),
    update: jest.fn(),
  },
};
const mockCrypto = { decrypt: jest.fn(), encrypt: jest.fn() };

describe('DoctorService — schedule date validation', () => {
  let service: DoctorService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DoctorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AesGcmService, useValue: mockCrypto },
      ],
    }).compile();
    service = module.get(DoctorService);
    jest.clearAllMocks();
  });

  describe('createSchedule', () => {
    it('throws BadRequestException when date is in the past', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await expect(
        service.createSchedule('doc1', 'org1', {
          date: yesterday.toISOString(), startTime: '09:00', endTime: '10:00',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.doctorSchedule.create).not.toHaveBeenCalled();
    });

    it('allows a schedule for today', async () => {
      mockPrisma.doctorSchedule.create.mockResolvedValue({ id: 's1' });
      const today = new Date();

      await service.createSchedule('doc1', 'org1', {
        date: today.toISOString(), startTime: '09:00', endTime: '10:00',
      });

      expect(mockPrisma.doctorSchedule.create).toHaveBeenCalled();
    });

    it('allows a schedule for a future date', async () => {
      mockPrisma.doctorSchedule.create.mockResolvedValue({ id: 's2' });
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      await service.createSchedule('doc1', 'org1', {
        date: nextWeek.toISOString(), startTime: '09:00', endTime: '10:00',
      });

      expect(mockPrisma.doctorSchedule.create).toHaveBeenCalled();
    });
  });

  describe('updateSchedule', () => {
    it('throws BadRequestException when updating to a past date', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await expect(
        service.updateSchedule('sched1', 'doc1', { date: yesterday.toISOString() }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.doctorSchedule.update).not.toHaveBeenCalled();
    });

    it('allows an update that does not change the date', async () => {
      mockPrisma.doctorSchedule.update.mockResolvedValue({ id: 'sched1' });

      await service.updateSchedule('sched1', 'doc1', { startTime: '11:00' });

      expect(mockPrisma.doctorSchedule.update).toHaveBeenCalled();
    });
  });
});
