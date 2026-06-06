export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'not_found';
export type EventPriority = 'normal' | 'urgent' | 'critical';

export interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  dueAt?: string;
  patientName: string;
  patientHn: string;
  formTemplateId?: string;
}
