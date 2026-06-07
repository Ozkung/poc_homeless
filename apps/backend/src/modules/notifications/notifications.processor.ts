import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { LineService } from '../line/line.service';
import {
  TaskNotificationPayload, OverdueAlertPayload,
  SosAlertPayload, MorningBriefingPayload,
} from './notifications.service';

@Processor('notifications')
export class NotificationsProcessor {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(@Inject(forwardRef(() => LineService)) private line: LineService) {}

  @Process('send-task-notification')
  async handleTaskNotification(job: Job<TaskNotificationPayload>) {
    const { lineUserId, taskId, title, patientName, token, dueAt } = job.data;
    this.logger.log(`Sending task notification for task ${taskId}`);
    await this.line.pushTaskNotification(lineUserId, {
      id: taskId, title, patientName, token,
      dueAt: dueAt ? new Date(dueAt) : undefined,
    });
  }

  @Process('send-overdue-alert')
  async handleOverdueAlert(job: Job<OverdueAlertPayload>) {
    this.logger.log(`Sending overdue alert for HN ${job.data.hn}`);
    await this.line.pushOverdueAlert(job.data.lineUserId, job.data);
  }

  @Process('send-sos-alert')
  async handleSosAlert(job: Job<SosAlertPayload>) {
    this.logger.log(`Sending SOS alert for HN ${job.data.hn}`);
    await this.line.pushSosAlert(job.data.lineUserId, job.data);
  }

  @Process('send-morning-briefing')
  async handleMorningBriefing(job: Job<MorningBriefingPayload>) {
    this.logger.log(`Sending morning briefing to ${job.data.lineUserId}`);
    await this.line.pushMorningBriefing(job.data.lineUserId, job.data.patients);
  }
}
