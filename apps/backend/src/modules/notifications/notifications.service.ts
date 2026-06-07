import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

export interface TaskNotificationPayload {
  lineUserId: string;
  taskId: string;
  title: string;
  patientName: string;
  token: string;
  dueAt?: string;
}

@Injectable()
export class NotificationsService {
  constructor(@InjectQueue('notifications') private queue: Queue) {}

  async enqueueTaskNotification(payload: TaskNotificationPayload) {
    await this.queue.add('send-task-notification', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    });
  }
}
