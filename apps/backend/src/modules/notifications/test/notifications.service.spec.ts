import { Test } from '@nestjs/testing';
import { NotificationsService } from '../notifications.service';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';

const mockQueue: Partial<Queue> = {
  add: jest.fn().mockResolvedValue({ id: '1' }),
};

describe('NotificationsService', () => {
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

  it('enqueueTaskNotification calls queue.add with correct job data', async () => {
    const payload = { lineUserId: 'U123', taskId: 't1', title: 'Task 1', patientName: 'John', token: 'tok' };
    await service.enqueueTaskNotification(payload);
    expect(mockQueue.add).toHaveBeenCalledWith('send-task-notification', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    });
  });
});
