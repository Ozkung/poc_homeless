import { Test } from '@nestjs/testing';
import { AlertsService, TRIAGE } from '../alerts.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AesGcmService } from '../../../common/crypto/aes-gcm.service';

const mockPrisma = {
  patient: { findMany: jest.fn(), update: jest.fn() },
  activity: { findFirst: jest.fn() },
  alert: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
  user: { findMany: jest.fn() },
  eventTask: { findFirst: jest.fn() },
};
const mockNotifications = {
  enqueueOverdueAlert: jest.fn().mockResolvedValue(undefined),
  enqueueMorningBriefing: jest.fn().mockResolvedValue(undefined),
};
const mockCrypto = { decrypt: jest.fn((v: string) => `DECRYPTED_${v}`) };

const NOW = new Date('2026-06-08T06:00:00Z');

describe('AlertsService.runEscalationCheck', () => {
  let service: AlertsService;

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(NOW);
    const module = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: AesGcmService, useValue: mockCrypto },
      ],
    }).compile();
    service = module.get(AlertsService);
    jest.clearAllMocks();
  });

  afterEach(() => jest.useRealTimers());

  it('TRIAGE export has correct thresholds', () => {
    expect(TRIAGE.CRITICAL).toEqual({ visitFreq: 2, alertAfter: 1, missingAfter: 5 });
    expect(TRIAGE.PENDING).toEqual({ visitFreq: 4, alertAfter: 2, missingAfter: 14 });
    expect(TRIAGE.STABLE).toEqual({ visitFreq: 7, alertAfter: 3, missingAfter: 30 });
  });

  it('enqueues overdue alert when daysMissed >= alertThreshold and no alert today', async () => {
    const lastCheckIn = new Date('2026-06-06T10:00:00Z'); // 2 days ago — CRITICAL alertAfter=1
    mockPrisma.patient.findMany.mockResolvedValue([
      { id: 'p1', organizationId: 'o1', status: 'CRITICAL', nameEnc: 'enc_name', hn: 'HN001', locationText: null, createdAt: new Date('2026-01-01') },
    ]);
    mockPrisma.activity.findFirst.mockResolvedValue({ createdAt: lastCheckIn });
    mockPrisma.alert.findFirst.mockResolvedValue(null);
    mockPrisma.alert.create.mockResolvedValue({});
    mockPrisma.patient.update.mockResolvedValue({});
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'cm1', displayName: 'CM A', lineUserId: 'U_CM' },
    ]);

    await service.runEscalationCheck();

    expect(mockNotifications.enqueueOverdueAlert).toHaveBeenCalledWith(
      expect.objectContaining({ lineUserId: 'U_CM', status: 'CRITICAL', daysMissed: 2, hn: 'HN001' }),
    );
    expect(mockPrisma.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'OVERDUE', patientId: 'p1' }) }),
    );
  });

  it('does not send duplicate alert if one already exists today', async () => {
    const lastCheckIn = new Date('2026-06-06T10:00:00Z');
    mockPrisma.patient.findMany.mockResolvedValue([
      { id: 'p1', organizationId: 'o1', status: 'CRITICAL', nameEnc: 'enc', hn: 'HN001', locationText: null, createdAt: new Date('2026-01-01') },
    ]);
    mockPrisma.activity.findFirst.mockResolvedValue({ createdAt: lastCheckIn });
    mockPrisma.alert.findFirst.mockResolvedValue({ id: 'existing' });
    mockPrisma.user.findMany.mockResolvedValue([{ lineUserId: 'U_CM' }]);

    await service.runEscalationCheck();

    expect(mockNotifications.enqueueOverdueAlert).not.toHaveBeenCalled();
  });
});
