import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

export interface TaskNotificationPayload {
  lineUserId: string; taskId: string; title: string;
  patientName: string; token: string; dueAt?: string;
}

export interface OverdueAlertPayload {
  lineUserId: string; patientName: string; hn: string;
  status: string; daysMissed: number;
}

export interface SosAlertPayload {
  lineUserId: string; patientName: string; hn: string;
  caregiverName: string; lat?: number; lng?: number;
}

export interface MorningBriefingPayload {
  lineUserId: string;
  patients: { name: string; hn: string; status: string; locationText?: string }[];
}

export interface AdjNotifyPayload {
  lineUserId: string; itemName: string; qty: number; adminName: string;
}

export interface AdjRequestPayload {
  lineUserId: string; itemName: string; qty: number;
  adminName: string; reason: string; adjId: string;
}

export interface AdjResultPayload {
  lineUserId: string; itemName: string; qty: number;
  approved: boolean; reviewNote?: string;
}

export interface LowStockPayload {
  lineUserId: string; itemName: string; currentStock: number; threshold: number;
}

const JOB_OPTS = { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true };

@Injectable()
export class NotificationsService {
  constructor(@InjectQueue('notifications') private queue: Queue) {}

  async enqueueTaskNotification(payload: TaskNotificationPayload) {
    await this.queue.add('send-task-notification', payload, JOB_OPTS);
  }

  async enqueueOverdueAlert(payload: OverdueAlertPayload) {
    await this.queue.add('send-overdue-alert', payload, JOB_OPTS);
  }

  async enqueueSosAlert(payload: SosAlertPayload) {
    await this.queue.add('send-sos-alert', payload, JOB_OPTS);
  }

  async enqueueMorningBriefing(payload: MorningBriefingPayload) {
    await this.queue.add('send-morning-briefing', payload, { attempts: 2, removeOnComplete: true });
  }

  async enqueueAdjNotify(payload: AdjNotifyPayload) {
    await this.queue.add('send-adj-notify', payload, JOB_OPTS);
  }

  async enqueueAdjRequest(payload: AdjRequestPayload) {
    await this.queue.add('send-adj-request', payload, JOB_OPTS);
  }

  async enqueueAdjResult(payload: AdjResultPayload) {
    await this.queue.add('send-adj-result', payload, JOB_OPTS);
  }

  async enqueueLowStock(payload: LowStockPayload) {
    await this.queue.add('send-low-stock', payload, JOB_OPTS);
  }
}
