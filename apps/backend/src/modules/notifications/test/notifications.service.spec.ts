import { Test } from '@nestjs/testing';
import { NotificationsService } from '../notifications.service';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';

const mockQueue: Partial<Queue> = { add: jest.fn().mockResolvedValue({ id: '1' }) };

describe('NotificationsService — alert methods', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getQueueToken('notifications'), useValue: mockQueue },
      ],
    }).compile();
    service = module.get(NotificationsService);
    jest.clearAllMocks();
  });

  it('enqueueOverdueAlert calls queue.add with send-overdue-alert', async () => {
    const payload = { lineUserId: 'U1', patientName: 'John', hn: '001', status: 'CRITICAL', daysMissed: 2 };
    await service.enqueueOverdueAlert(payload);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'send-overdue-alert', payload, expect.objectContaining({ attempts: 3 }),
    );
  });

  it('enqueueSosAlert calls queue.add with send-sos-alert', async () => {
    const payload = { lineUserId: 'U1', patientName: 'John', hn: '001', caregiverName: 'A', lat: 13.7, lng: 100.5 };
    await service.enqueueSosAlert(payload);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'send-sos-alert', payload, expect.objectContaining({ attempts: 3 }),
    );
  });

  it('enqueueMorningBriefing calls queue.add with send-morning-briefing', async () => {
    const payload = { lineUserId: 'U1', patients: [{ name: 'John', hn: '001', status: 'CRITICAL' }] };
    await service.enqueueMorningBriefing(payload);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'send-morning-briefing', payload, expect.objectContaining({ attempts: 2 }),
    );
  });
});
