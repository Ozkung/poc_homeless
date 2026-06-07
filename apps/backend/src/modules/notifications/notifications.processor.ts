import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { LineService } from '../line/line.service';
import { TaskNotificationPayload } from './notifications.service';

@Processor('notifications')
export class NotificationsProcessor {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(@Inject(forwardRef(() => LineService)) private line: LineService) {}

  @Process('send-task-notification')
  async handleTaskNotification(job: Job<TaskNotificationPayload>) {
    const { lineUserId, taskId, title, patientName, token, dueAt } = job.data;
    this.logger.log(`Sending Line notification for task ${taskId}`);
    await this.line.pushTaskNotification(lineUserId, {
      id: taskId,
      title,
      patientName,
      token,
      dueAt: dueAt ? new Date(dueAt) : undefined,
    });
  }
}
