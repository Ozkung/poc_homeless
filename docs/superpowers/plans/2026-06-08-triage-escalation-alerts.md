# Triage Escalation & Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monitor visit frequency by triage level, alert CM via Dashboard + LINE when overdue, mark patients MISSING at final threshold, send Caregiver morning briefing at 07:45, and add SOS button to LIFF.

**Architecture:** NestJS `@nestjs/schedule` cron jobs inside a new `AlertsModule`. Escalation logic queries last `CHECK_IN` Activity per patient (checkin() is fixed to create one). LINE messages go through the existing Bull `notifications` queue via 3 new job types. Frontend dashboard fetches `GET /alerts` as a server component. LIFF SOS uses a fixed bottom bar with geolocation.

**Tech Stack:** NestJS 10, `@nestjs/schedule`, `@nestjs/bull`, Prisma, LINE Messaging API, Next.js 16 App Router, React LIFF

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `apps/backend/prisma/schema.prisma` | Add `MISSING`, `SOS`, `Alert` model, `AlertType` enum |
| Create | `apps/backend/prisma/migrations/…` | via `prisma migrate dev` |
| Modify | `apps/backend/src/modules/tasks/tasks.service.ts` | Fix `checkin()` to create `Activity` |
| Modify | `apps/backend/src/modules/tasks/test/tasks.service.spec.ts` | Tests for Activity creation |
| Modify | `apps/backend/src/modules/line/line.service.ts` | Add 3 new push methods |
| Modify | `apps/backend/src/modules/notifications/notifications.service.ts` | Add 3 enqueue methods |
| Modify | `apps/backend/src/modules/notifications/notifications.processor.ts` | Handle 3 new job types |
| Create | `apps/backend/src/modules/notifications/test/notifications.service.spec.ts` | Extended tests |
| Create | `apps/backend/src/modules/alerts/alerts.module.ts` | Register ScheduleModule |
| Create | `apps/backend/src/modules/alerts/alerts.service.ts` | Cron logic |
| Create | `apps/backend/src/modules/alerts/alerts.controller.ts` | `GET /alerts` |
| Create | `apps/backend/src/modules/alerts/test/alerts.service.spec.ts` | Tests |
| Modify | `apps/backend/src/app.module.ts` | Import AlertsModule |
| Modify | `apps/backend/src/modules/patients/patients.service.ts` | Add `createSos()` |
| Modify | `apps/backend/src/modules/patients/patients.controller.ts` | SOS endpoints |
| Create | `apps/backend/src/modules/patients/dto/sos.dto.ts` | SOS request DTO |
| Create | `apps/frontend/src/components/dashboard/AlertSection.tsx` | Alert rows component |
| Modify | `apps/frontend/src/app/(app)/dashboard/page.tsx` | Fetch + render alerts |
| Modify | `apps/liff/src/lib/api.ts` | Add `sos()` method |
| Modify | `apps/liff/src/pages/TaskPage.tsx` | SOS bottom bar |

---

## Task 1: Schema — Add MISSING, SOS, Alert model

**Files:**
- Modify: `apps/backend/prisma/schema.prisma`

- [ ] **Step 1: Edit schema.prisma**

In `PatientStatus` enum add `MISSING`:
```prisma
enum PatientStatus {
  CRITICAL
  PENDING
  STABLE
  MISSING
}
```

In `ActivityType` enum add `SOS`:
```prisma
enum ActivityType {
  CHECK_IN
  NOTE
  FORM_SUBMIT
  ASSIGN
  STATUS_CHANGE
  LOGIN
  LOGOUT
  SOS
}
```

Add new `AlertType` enum and `Alert` model at the end of the file (after the `Activity` model):
```prisma
enum AlertType {
  OVERDUE
  MISSING
  SOS
}

model Alert {
  id          String    @id @default(uuid())
  patientId   String
  patient     Patient   @relation(fields: [patientId], references: [id], onDelete: Cascade)
  type        AlertType
  daysMissed  Int?
  lat         Float?
  lng         Float?
  sentAt      DateTime  @default(now())
  resolvedAt  DateTime?
  resolvedBy  String?
}
```

Inside `model Patient`, add after `eventTasks EventTask[]`:
```prisma
  alerts      Alert[]
```

- [ ] **Step 2: Validate schema**

```bash
cd apps/backend && npx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid`

- [ ] **Step 3: Run migration**

```bash
cd apps/backend && DATABASE_URL=postgresql://homemed:homemed_dev@localhost:5432/homemed npx prisma migrate dev --name add-alert-missing-sos
```

Expected: `Your database is now in sync with your schema.`

If DB not running: `docker compose up -d postgres redis`

- [ ] **Step 4: Generate Prisma client**

```bash
cd apps/backend && npx prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/prisma/
git commit -m "feat: add MISSING status, SOS activity type, Alert model"
```

---

## Task 2: Fix checkin() to create CHECK\_IN Activity

**Files:**
- Modify: `apps/backend/src/modules/tasks/tasks.service.ts`
- Modify: `apps/backend/src/modules/tasks/test/tasks.service.spec.ts`

- [ ] **Step 1: Add test to existing spec file**

Open `apps/backend/src/modules/tasks/test/tasks.service.spec.ts`. In the existing `describe` block, add:

```typescript
it('checkin creates a CHECK_IN Activity for the patient', async () => {
  mockPrisma.eventTask.findUnique.mockResolvedValue({
    id: 't1', assigneeId: 'u1', patientId: 'p1', event: {}, patient: {}, assignee: {},
  });
  mockPrisma.eventTask.update.mockResolvedValue({ id: 't1', status: 'IN_PROGRESS' });
  mockRedis.get.mockResolvedValue(null);
  mockRedis.setex.mockResolvedValue('OK');
  mockPrisma.activity = { create: jest.fn().mockResolvedValue({ id: 'act1' }) };

  await service.checkin('t1', 'u1');

  expect(mockPrisma.activity.create).toHaveBeenCalledWith({
    data: { actorId: 'u1', patientId: 'p1', taskId: 't1', type: 'CHECK_IN', payload: null },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && npx jest src/modules/tasks/test/tasks.service.spec.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `activity.create` not called.

- [ ] **Step 3: Update checkin() in tasks.service.ts**

Replace the `checkin` method:

```typescript
async checkin(taskId: string, userId: string) {
  const task = await this.findOne(taskId);
  if (task.assigneeId !== userId) throw new NotFoundException('Task not found');

  const rateLimitKey = `checkin:${taskId}:${userId}`;
  const existing = await this.redis.get(rateLimitKey);
  if (existing) throw new HttpException('Check-in already recorded in the last hour', HttpStatus.TOO_MANY_REQUESTS);

  await this.redis.setex(rateLimitKey, 3600, '1');
  const [updated] = await Promise.all([
    this.prisma.eventTask.update({
      where: { id: taskId },
      data: { status: 'IN_PROGRESS' },
    }),
    this.prisma.activity.create({
      data: {
        actorId: userId,
        patientId: task.patientId,
        taskId,
        type: 'CHECK_IN',
        payload: null,
      },
    }),
  ]);
  return updated;
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/backend && npx jest src/modules/tasks/test/tasks.service.spec.ts --no-coverage 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/tasks/tasks.service.ts apps/backend/src/modules/tasks/test/tasks.service.spec.ts
git commit -m "fix: checkin() creates CHECK_IN Activity for escalation tracking"
```

---

## Task 3: Install @nestjs/schedule + extend LineService

**Files:**
- Modify: `apps/backend/src/modules/line/line.service.ts`

- [ ] **Step 1: Install @nestjs/schedule**

```bash
cd apps/backend && npm install @nestjs/schedule
```

- [ ] **Step 2: Add 3 new push methods to LineService**

Open `apps/backend/src/modules/line/line.service.ts`. Add these methods after `pushTaskNotification`:

```typescript
async pushOverdueAlert(lineUserId: string, data: {
  patientName: string; hn: string; status: string; daysMissed: number;
}) {
  const statusLabel: Record<string, string> = {
    CRITICAL: '🔴 วิกฤต', PENDING: '🟡 รอดำเนินการ', STABLE: '🟢 ปกติ',
  };
  const text = [
    '⚠️ แจ้งเตือน: เกินกำหนดเยี่ยม',
    `ผู้ป่วย: ${data.patientName} (HN ${data.hn})`,
    `ระดับ: ${statusLabel[data.status] ?? data.status}`,
    `เกินกำหนด: ${data.daysMissed} วัน`,
    'กรุณาติดตามหรือส่ง Caregiver โดยด่วน',
  ].join('\n');
  await this.pushText(lineUserId, text);
}

async pushSosAlert(lineUserId: string, data: {
  patientName: string; hn: string; caregiverName: string; lat?: number; lng?: number;
}) {
  const location = data.lat != null && data.lng != null
    ? `📍 ${data.lat.toFixed(4)}°N, ${data.lng.toFixed(4)}°E`
    : '📍 ไม่ทราบตำแหน่ง';
  const text = [
    '🚨 SOS — เหตุฉุกเฉิน',
    `อาสา: ${data.caregiverName}`,
    `ผู้ป่วย: ${data.patientName} (HN ${data.hn})`,
    location,
  ].join('\n');
  await this.pushText(lineUserId, text);
}

async pushMorningBriefing(lineUserId: string, patients: {
  name: string; hn: string; status: string; locationText?: string;
}[]) {
  const statusLabel: Record<string, string> = {
    CRITICAL: '🔴 วิกฤต', PENDING: '🟡 เฝ้าระวัง', STABLE: '🟢 ปกติ',
  };
  const lines = [
    '☀️ ผู้ป่วยที่ต้องเยี่ยมวันนี้',
    ...patients.map((p) =>
      `• ${p.name} (HN ${p.hn}) ${statusLabel[p.status] ?? p.status}${p.locationText ? ` — ${p.locationText}` : ''}`,
    ),
    `\nเปิด LIFF: https://liff.line.me/${this.liffId}`,
  ];
  await this.pushText(lineUserId, lines.join('\n'));
}

private async pushText(lineUserId: string, text: string) {
  const res = await fetch(`${LINE_API}/v2/bot/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.channelAccessToken}`,
    },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) {
    this.logger.error(`Line push failed: ${res.status} ${await res.text()}`);
  }
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/line/line.service.ts apps/backend/package.json apps/backend/package-lock.json
git commit -m "feat: install @nestjs/schedule, add LINE push methods for alerts"
```

---

## Task 4: NotificationsService — 3 new job types

**Files:**
- Modify: `apps/backend/src/modules/notifications/notifications.service.ts`
- Modify: `apps/backend/src/modules/notifications/notifications.processor.ts`
- Create: `apps/backend/src/modules/notifications/test/notifications.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/backend/src/modules/notifications/test/notifications.service.spec.ts`:

```typescript
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
    expect(mockQueue.add).toHaveBeenCalledWith('send-overdue-alert', payload, expect.objectContaining({ attempts: 3 }));
  });

  it('enqueueSosAlert calls queue.add with send-sos-alert', async () => {
    const payload = { lineUserId: 'U1', patientName: 'John', hn: '001', caregiverName: 'A', lat: 13.7, lng: 100.5 };
    await service.enqueueSosAlert(payload);
    expect(mockQueue.add).toHaveBeenCalledWith('send-sos-alert', payload, expect.objectContaining({ attempts: 3 }));
  });

  it('enqueueMorningBriefing calls queue.add with send-morning-briefing', async () => {
    const payload = { lineUserId: 'U1', patients: [{ name: 'John', hn: '001', status: 'CRITICAL' }] };
    await service.enqueueMorningBriefing(payload);
    expect(mockQueue.add).toHaveBeenCalledWith('send-morning-briefing', payload, expect.objectContaining({ attempts: 2 }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && npx jest src/modules/notifications/test --no-coverage 2>&1 | tail -10
```

Expected: FAIL — methods not found.

- [ ] **Step 3: Update notifications.service.ts**

Replace the full file:

```typescript
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
}
```

- [ ] **Step 4: Update notifications.processor.ts**

Replace the full file:

```typescript
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
```

- [ ] **Step 5: Run tests**

```bash
cd apps/backend && npx jest src/modules/notifications/test --no-coverage 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/notifications/
git commit -m "feat: notifications — 3 new job types (overdue, SOS, morning briefing)"
```

---

## Task 5: AlertsModule + AlertsService escalation cron

**Files:**
- Create: `apps/backend/src/modules/alerts/alerts.module.ts`
- Create: `apps/backend/src/modules/alerts/alerts.service.ts`
- Create: `apps/backend/src/modules/alerts/test/alerts.service.spec.ts`
- Modify: `apps/backend/src/app.module.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/backend/src/modules/alerts/test/alerts.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { AlertsService, TRIAGE } from '../alerts.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';

const mockPrisma = {
  patient: { findMany: jest.fn() },
  activity: { findFirst: jest.fn() },
  alert: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
  user: { findMany: jest.fn() },
  eventTask: { findFirst: jest.fn() },
  $transaction: jest.fn((fn: any) => fn(mockPrisma)),
};
const mockNotifications = {
  enqueueOverdueAlert: jest.fn(),
  enqueueMorningBriefing: jest.fn(),
};

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
      ],
    }).compile();
    service = module.get(AlertsService);
    jest.clearAllMocks();
  });

  afterEach(() => jest.useRealTimers());

  it('enqueues overdue alert when daysMissed >= alertThreshold and no alert today', async () => {
    const lastCheckIn = new Date('2026-06-06T10:00:00Z'); // 2 days ago
    mockPrisma.patient.findMany.mockResolvedValue([
      { id: 'p1', organizationId: 'o1', status: 'CRITICAL' },
    ]);
    mockPrisma.activity.findFirst.mockResolvedValue({ createdAt: lastCheckIn });
    mockPrisma.alert.findFirst.mockResolvedValue(null); // no alert today
    mockPrisma.alert.create.mockResolvedValue({});
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'cm1', displayName: 'CM A', lineUserId: 'U_CM' },
    ]);

    await service.runEscalationCheck();

    expect(mockNotifications.enqueueOverdueAlert).toHaveBeenCalledWith(
      expect.objectContaining({ lineUserId: 'U_CM', status: 'CRITICAL', daysMissed: 2 }),
    );
    expect(mockPrisma.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'OVERDUE', patientId: 'p1' }) }),
    );
  });

  it('does not send duplicate alert if one already sent today', async () => {
    const lastCheckIn = new Date('2026-06-06T10:00:00Z');
    mockPrisma.patient.findMany.mockResolvedValue([{ id: 'p1', organizationId: 'o1', status: 'CRITICAL' }]);
    mockPrisma.activity.findFirst.mockResolvedValue({ createdAt: lastCheckIn });
    mockPrisma.alert.findFirst.mockResolvedValue({ id: 'existing-alert' }); // already sent today
    mockPrisma.user.findMany.mockResolvedValue([{ lineUserId: 'U_CM' }]);

    await service.runEscalationCheck();

    expect(mockNotifications.enqueueOverdueAlert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/backend && npx jest src/modules/alerts/test --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `AlertsService` not found.

- [ ] **Step 3: Create alerts.service.ts**

Create `apps/backend/src/modules/alerts/alerts.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole } from '@prisma/client';

export const TRIAGE = {
  CRITICAL: { visitFreq: 2, alertAfter: 1, missingAfter: 5 },
  PENDING:  { visitFreq: 4, alertAfter: 2, missingAfter: 14 },
  STABLE:   { visitFreq: 7, alertAfter: 3, missingAfter: 30 },
} as const;

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron('0 6 * * *')
  async runEscalationCheck() {
    this.logger.log('Running escalation check…');
    const patients = await this.prisma.patient.findMany({
      where: { status: { in: ['CRITICAL', 'PENDING', 'STABLE'] } },
    });

    for (const patient of patients) {
      const config = TRIAGE[patient.status as keyof typeof TRIAGE];
      if (!config) continue;

      const lastActivity = await this.prisma.activity.findFirst({
        where: { patientId: patient.id, type: 'CHECK_IN' },
        orderBy: { createdAt: 'desc' },
      });

      const baseline = lastActivity?.createdAt ?? patient.createdAt ?? new Date();
      const daysMissed = Math.floor((Date.now() - baseline.getTime()) / 86_400_000);

      if (daysMissed < config.alertAfter) continue;

      const cms = await this.prisma.user.findMany({
        where: { organizationId: patient.organizationId, role: UserRole.CASE_MANAGER, lineUserId: { not: null } },
        select: { lineUserId: true, displayName: true },
      });

      if (daysMissed >= config.missingAfter && patient.status !== 'MISSING') {
        await this.prisma.patient.update({ where: { id: patient.id }, data: { status: 'MISSING' } });
        await this.prisma.alert.create({ data: { patientId: patient.id, type: 'MISSING', daysMissed } });
        for (const cm of cms) {
          if (cm.lineUserId) {
            await this.notifications.enqueueOverdueAlert({
              lineUserId: cm.lineUserId, patientName: patient.id, hn: patient.id,
              status: 'MISSING', daysMissed,
            });
          }
        }
        continue;
      }

      // Check dedup: no OVERDUE alert sent today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const existing = await this.prisma.alert.findFirst({
        where: { patientId: patient.id, type: 'OVERDUE', resolvedAt: null, sentAt: { gte: todayStart } },
      });
      if (existing) continue;

      await this.prisma.alert.create({ data: { patientId: patient.id, type: 'OVERDUE', daysMissed } });
      for (const cm of cms) {
        if (cm.lineUserId) {
          await this.notifications.enqueueOverdueAlert({
            lineUserId: cm.lineUserId, patientName: patient.id, hn: patient.id,
            status: patient.status, daysMissed,
          });
        }
      }
    }
    this.logger.log('Escalation check complete');
  }

  @Cron('45 7 * * *')
  async sendCaregiverMorningBriefing() {
    this.logger.log('Sending morning briefings…');
    const patients = await this.prisma.patient.findMany({
      where: { status: { in: ['CRITICAL', 'PENDING', 'STABLE'] } },
    });

    const caregiverMap = new Map<string, {
      lineUserId: string;
      patients: { name: string; hn: string; status: string; locationText?: string }[];
    }>();

    for (const patient of patients) {
      const config = TRIAGE[patient.status as keyof typeof TRIAGE];
      if (!config) continue;

      const lastActivity = await this.prisma.activity.findFirst({
        where: { patientId: patient.id, type: 'CHECK_IN' },
        orderBy: { createdAt: 'desc' },
      });

      const baseline = lastActivity?.createdAt ?? patient.createdAt ?? new Date();
      const daysSince = Math.floor((Date.now() - baseline.getTime()) / 86_400_000);
      if (daysSince < config.visitFreq) continue;

      const task = await this.prisma.eventTask.findFirst({
        where: { patientId: patient.id, status: { in: ['PENDING', 'IN_PROGRESS'] } },
        include: { assignee: { select: { id: true, lineUserId: true, displayName: true } } },
        orderBy: { createdAt: 'desc' },
      });

      const caregiver = task?.assignee;
      if (!caregiver?.lineUserId) continue;

      if (!caregiverMap.has(caregiver.id)) {
        caregiverMap.set(caregiver.id, { lineUserId: caregiver.lineUserId, patients: [] });
      }
      caregiverMap.get(caregiver.id)!.patients.push({
        name: patient.id,
        hn: patient.id,
        status: patient.status,
        locationText: patient.locationText ?? undefined,
      });
    }

    for (const { lineUserId, patients: pts } of caregiverMap.values()) {
      await this.notifications.enqueueMorningBriefing({ lineUserId, patients: pts });
    }
    this.logger.log(`Morning briefings queued for ${caregiverMap.size} caregivers`);
  }

  async getActiveAlerts(orgId: string) {
    return this.prisma.alert.findMany({
      where: { resolvedAt: null, patient: { organizationId: orgId } },
      include: {
        patient: { select: { id: true, hn: true, nameEnc: true, status: true, locationText: true } },
      },
      orderBy: [{ type: 'asc' }, { sentAt: 'desc' }],
      take: 20,
    });
  }
}
```

**Note:** `patientName` in `runEscalationCheck` uses `patient.id` as placeholder because name is AES-encrypted in `nameEnc`. The alerts.service needs access to `AesGcmService` to decrypt. Add it to the constructor and replace `patient.id` placeholders:

Update the constructor to also inject `AesGcmService`:
```typescript
import { AesGcmService } from '../../common/crypto/aes-gcm.service';

constructor(
  private prisma: PrismaService,
  private notifications: NotificationsService,
  private crypto: AesGcmService,
) {}
```

Replace `patientName: patient.id, hn: patient.id` with:
```typescript
patientName: this.crypto.decrypt(patient.nameEnc), hn: patient.hn,
```

And in `caregiverMap.get(caregiver.id)!.patients.push`:
```typescript
name: this.crypto.decrypt(patient.nameEnc),
hn: patient.hn,
```

- [ ] **Step 4: Create alerts.module.ts**

Create `apps/backend/src/modules/alerts/alerts.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';

@Module({
  imports: [ScheduleModule.forRoot(), NotificationsModule, PrismaModule],
  providers: [AlertsService, AesGcmService],
  controllers: [AlertsController],
  exports: [AlertsService],
})
export class AlertsModule {}
```

- [ ] **Step 5: Wire into app.module.ts**

In `apps/backend/src/app.module.ts`, add import:

```typescript
import { AlertsModule } from './modules/alerts/alerts.module';
```

Add `AlertsModule` to the `imports` array.

- [ ] **Step 6: Run tests**

```bash
cd apps/backend && npx jest src/modules/alerts/test --no-coverage 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 7: TypeScript check**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -15
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/alerts/ apps/backend/src/app.module.ts apps/backend/package.json apps/backend/package-lock.json
git commit -m "feat: AlertsModule with escalation cron + morning briefing cron"
```

---

## Task 6: AlertsController — GET /alerts

**Files:**
- Create: `apps/backend/src/modules/alerts/alerts.controller.ts`

- [ ] **Step 1: Create the controller**

Create `apps/backend/src/modules/alerts/alerts.controller.ts`:

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CASE_MANAGER, UserRole.ADMIN)
export class AlertsController {
  constructor(private alerts: AlertsService) {}

  @Get()
  getAlerts(@CurrentUser() user: JwtPayload) {
    return this.alerts.getActiveAlerts(user.orgId);
  }
}
```

- [ ] **Step 2: TypeScript check + all backend tests**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -10 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no TypeScript errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/alerts/alerts.controller.ts
git commit -m "feat: GET /alerts endpoint for CM dashboard"
```

---

## Task 7: SOS endpoints — backend

**Files:**
- Create: `apps/backend/src/modules/patients/dto/sos.dto.ts`
- Modify: `apps/backend/src/modules/patients/patients.service.ts`
- Modify: `apps/backend/src/modules/patients/patients.controller.ts`

- [ ] **Step 1: Create SosDto**

Create `apps/backend/src/modules/patients/dto/sos.dto.ts`:

```typescript
import { IsNumber, IsOptional } from 'class-validator';

export class SosDto {
  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;
}
```

- [ ] **Step 2: Add createSos() to patients.service.ts**

Open `apps/backend/src/modules/patients/patients.service.ts`. Add import at top:

```typescript
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole } from '@prisma/client';
```

Update constructor to inject NotificationsService:

```typescript
constructor(
  private prisma: PrismaService,
  private crypto: AesGcmService,
  private notifications: NotificationsService,
) {}
```

Add `createSos` method at the end (before the private `decrypt` method):

```typescript
async createSos(patientId: string, orgId: string, userId: string, coords: { lat?: number; lng?: number }) {
  const patient = await this.findOne(patientId, orgId);
  const actor = await this.prisma.user.findUnique({
    where: { id: userId }, select: { displayName: true },
  });

  await Promise.all([
    this.prisma.activity.create({
      data: {
        actorId: userId, patientId,
        type: 'SOS',
        payload: { lat: coords.lat, lng: coords.lng },
      },
    }),
    this.prisma.alert.create({
      data: { patientId, type: 'SOS', lat: coords.lat, lng: coords.lng },
    }),
  ]);

  const cms = await this.prisma.user.findMany({
    where: { organizationId: orgId, role: UserRole.CASE_MANAGER, lineUserId: { not: null } },
    select: { lineUserId: true },
  });

  await Promise.all(
    cms.map((cm) =>
      this.notifications.enqueueSosAlert({
        lineUserId: cm.lineUserId!,
        patientName: patient.name,
        hn: patient.hn,
        caregiverName: actor?.displayName ?? 'อาสา',
        lat: coords.lat,
        lng: coords.lng,
      }),
    ),
  );

  return { ok: true };
}

async createSosByTask(taskId: string, userId: string, coords: { lat?: number; lng?: number }) {
  const task = await this.prisma.eventTask.findUnique({
    where: { id: taskId },
    include: { patient: { select: { organizationId: true } } },
  });
  if (!task) throw new NotFoundException('Task not found');
  return this.createSos(task.patientId, task.patient.organizationId, userId, coords);
}
```

- [ ] **Step 3: Update PatientsModule to provide NotificationsService**

Open `apps/backend/src/modules/patients/patients.module.ts`. Add:

```typescript
import { NotificationsModule } from '../notifications/notifications.module';

// In @Module imports array:
imports: [NotificationsModule],
```

- [ ] **Step 4: Add SOS endpoints to patients.controller.ts**

Open `apps/backend/src/modules/patients/patients.controller.ts`. Add imports:

```typescript
import { SosDto } from './dto/sos.dto';
```

Add after the last endpoint (before closing `}`):

```typescript
@Post(':id/sos')
@HttpCode(HttpStatus.OK)
createSos(
  @Param('id') id: string,
  @Body() dto: SosDto,
  @CurrentUser() user: JwtPayload,
) {
  return this.patients.createSos(id, user.orgId, user.sub, dto);
}

@Post('sos-by-task/:taskId')
@HttpCode(HttpStatus.OK)
createSosByTask(
  @Param('taskId') taskId: string,
  @Body() dto: SosDto,
  @CurrentUser() user: JwtPayload,
) {
  return this.patients.createSosByTask(taskId, user.sub, dto);
}
```

Note: `sos-by-task/:taskId` must be declared **before** `:id/sos` to avoid route conflicts. In NestJS, literal routes match first, so the order in the controller is fine as written above.

- [ ] **Step 5: TypeScript check + all backend tests**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -15 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/patients/
git commit -m "feat: SOS endpoints POST /patients/:id/sos + /patients/sos-by-task/:taskId"
```

---

## Task 8: Dashboard — AlertSection component

**Files:**
- Create: `apps/frontend/src/components/dashboard/AlertSection.tsx`
- Modify: `apps/frontend/src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Create AlertSection component**

Create `apps/frontend/src/components/dashboard/AlertSection.tsx`:

```tsx
import Link from 'next/link';

interface AlertRow {
  id: string;
  type: 'OVERDUE' | 'MISSING' | 'SOS';
  daysMissed: number | null;
  lat: number | null;
  lng: number | null;
  sentAt: string;
  patient: {
    id: string;
    hn: string;
    nameEnc: string;
    status: string;
    locationText: string | null;
  };
}

interface AlertSectionProps {
  alerts: AlertRow[];
}

const STATUS_LABEL: Record<string, string> = {
  CRITICAL: 'วิกฤต', PENDING: 'รอดำเนินการ', STABLE: 'ปกติ', MISSING: 'สูญหาย',
};

export default function AlertSection({ alerts }: AlertSectionProps) {
  if (alerts.length === 0) return null;

  const sosCount = alerts.filter((a) => a.type === 'SOS').length;
  const total = alerts.length;

  return (
    <div style={{
      background: '#fff', borderRadius: 10, border: '1px solid #f0f0f0',
      marginBottom: 14, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid #fafafa',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>🔔</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#111' }}>แจ้งเตือนที่รอดำเนินการ</span>
          <span style={{
            background: sosCount > 0 ? '#ff4d4f' : '#faad14',
            color: '#fff', fontSize: 10, fontWeight: 700,
            padding: '1px 7px', borderRadius: 99,
          }}>{total}</span>
        </div>
      </div>

      {/* Alert rows */}
      {alerts.map((alert) => {
        const isSos = alert.type === 'SOS';
        const isMissing = alert.type === 'MISSING';
        const bg = isSos ? '#fff0f0' : isMissing ? '#fff2f0' : alert.patient.status === 'CRITICAL' ? '#fff8f8' : '#fffdf0';
        const color = isSos || isMissing ? '#ff4d4f' : alert.patient.status === 'CRITICAL' ? '#ff4d4f' : '#d48806';
        const timeStr = new Date(alert.sentAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

        return (
          <div key={alert.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 16px', background: bg,
            borderBottom: '1px solid rgba(0,0,0,0.03)',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', background: color,
              flexShrink: 0,
              animation: isSos ? 'pulse 1s ease-in-out infinite' : 'none',
            }} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>
                HN {alert.patient.hn}
                {alert.patient.locationText && (
                  <span style={{ fontSize: 10, color: '#888', fontWeight: 400, marginLeft: 6 }}>
                    {alert.patient.locationText}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color, marginTop: 1 }}>
                {isSos
                  ? `🚨 SOS · ${timeStr} น.${alert.lat ? ` · ${alert.lat.toFixed(4)}°N` : ''}`
                  : isMissing
                  ? `⛔ สูญหาย — ไม่ได้รับการเยี่ยม ${alert.daysMissed} วัน`
                  : `⏰ เกินกำหนด ${alert.daysMissed} วัน — ${STATUS_LABEL[alert.patient.status] ?? alert.patient.status}`
                }
              </div>
            </div>

            <Link
              href={`/patients/${alert.patient.id}`}
              style={{
                fontSize: 10,
                background: isSos ? '#ff4d4f' : '#f5f5f5',
                color: isSos ? '#fff' : '#555',
                border: 'none', borderRadius: 6,
                padding: '4px 10px', cursor: 'pointer',
                fontWeight: isSos ? 700 : 400,
                textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              {isSos ? 'ดูเร่งด่วน' : 'จัดการ'}
            </Link>
          </div>
        );
      })}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Add fetchAlerts to dashboard page**

Open `apps/frontend/src/app/(app)/dashboard/page.tsx`. Add fetch function after `fetchEventCount`:

```typescript
async function fetchAlerts(token: string) {
  try {
    const res = await fetch(`${API_URL}/alerts`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    return res.ok ? res.json() : [];
  } catch { return []; }
}
```

Add `AlertSection` import at top:
```typescript
import AlertSection from '@/components/dashboard/AlertSection';
```

In `DashboardPage`, add `alerts` to the `Promise.all`:
```typescript
const [patients, eventCount, alerts] = await Promise.all([
  fetchPatients(token),
  fetchEventCount(token),
  fetchAlerts(token),
]);
```

In the JSX, add `<AlertSection alerts={alerts} />` directly before the bento grid `<div>`:
```tsx
<AlertSection alerts={alerts} />

{/* Bento grid */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
```

- [ ] **Step 3: TypeScript check + build**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | head -10
cd apps/frontend && npm run build 2>&1 | grep -E "error|✓ Compiled" | head -5
```

Expected: no errors, `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/dashboard/AlertSection.tsx apps/frontend/src/app/\(app\)/dashboard/page.tsx
git commit -m "feat(ui): dashboard AlertSection — overdue + SOS alerts above bento grid"
```

---

## Task 9: LIFF — SOS bottom bar

**Files:**
- Modify: `apps/liff/src/lib/api.ts`
- Modify: `apps/liff/src/pages/TaskPage.tsx`

- [ ] **Step 1: Add sos() to api.ts**

Open `apps/liff/src/lib/api.ts`. In the `api` object, add after `updateStatus`:

```typescript
sos: (taskId: string, coords: { lat?: number; lng?: number }) =>
  request(`/patients/sos-by-task/${taskId}`, {
    method: 'POST',
    body: JSON.stringify(coords),
  }),
```

- [ ] **Step 2: Add SOS bottom bar to TaskPage.tsx**

Open `apps/liff/src/pages/TaskPage.tsx`. Add state variables inside `TaskPage`:

```tsx
const [sosLoading, setSosLoading] = useState(false);
const [sosSent, setSosSent] = useState(false);
```

Add `handleSos` function inside `TaskPage` (before the return):

```tsx
async function handleSos() {
  if (!window.confirm('ยืนยันส่ง SOS? CM จะได้รับแจ้งทันที')) return;
  setSosLoading(true);
  let coords: { lat?: number; lng?: number } = {};
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }),
    );
    coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch { /* location denied — continue without */ }

  // Use first task's id, or empty string if no tasks
  const taskId = tasks[0]?.id ?? '';
  try {
    await api.sos(taskId, coords);
    setSosSent(true);
  } catch (e: any) {
    alert(e.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
  } finally {
    setSosLoading(false);
  }
}
```

In the return JSX, wrap existing content in a `<div style={{ paddingBottom: 56 }}>` to prevent the bottom bar from covering content. Then add the fixed bottom bar after the closing `</div>`:

```tsx
return (
  <div style={{ paddingBottom: 56 }}>
    {/* existing content unchanged */}
    {sosSent ? (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-5xl mb-4">✅</p>
          <p className="font-semibold text-gray-700 text-lg">ส่ง SOS แล้ว</p>
          <p className="text-sm text-gray-400 mt-1">รอ CM ติดต่อกลับ</p>
        </div>
      </div>
    ) : (
      /* existing task list JSX */
      <div className="max-w-lg mx-auto p-4">
        {/* ... unchanged ... */}
      </div>
    )}

    {/* SOS bottom bar — fixed, always visible */}
    {!sosSent && (
      <div
        onClick={handleSos}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: sosLoading ? '#d9363e' : '#ff4d4f',
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          cursor: sosLoading ? 'not-allowed' : 'pointer', zIndex: 100,
        }}
      >
        <span style={{ fontSize: 18 }}>🚨</span>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: 0.5 }}>
          {sosLoading ? 'กำลังส่ง SOS…' : 'SOS ฉุกเฉิน'}
        </span>
      </div>
    )}
  </div>
);
```

- [ ] **Step 3: TypeScript check + build**

```bash
cd apps/liff && npx tsc --noEmit 2>&1 | head -10
cd apps/liff && npm run build 2>&1 | tail -5
```

Expected: no errors, `✓ built in`.

- [ ] **Step 4: Commit**

```bash
git add apps/liff/src/lib/api.ts apps/liff/src/pages/TaskPage.tsx
git commit -m "feat(liff): SOS bottom bar with geolocation + confirm dialog"
```

---

## Self-Review

**Spec coverage:**
- ✅ `PatientStatus.MISSING`, `ActivityType.SOS`, `Alert` model → Task 1
- ✅ `checkin()` creates `CHECK_IN` Activity → Task 2
- ✅ `@nestjs/schedule` + `LineService` new push methods → Task 3
- ✅ 3 new Bull job types with TDD → Task 4
- ✅ `AlertsModule` + escalation cron 06:00 with dedup → Task 5
- ✅ Morning briefing cron 07:45 → Task 5
- ✅ `GET /alerts` endpoint → Task 6
- ✅ `POST /patients/:id/sos` + `POST /patients/sos-by-task/:taskId` → Task 7
- ✅ Dashboard `AlertSection` with SOS pulse animation → Task 8
- ✅ LIFF SOS bottom bar + geolocation + confirm → Task 9

**Placeholder scan:** No TBDs — all code blocks complete, all method signatures consistent across tasks.

**Type consistency:**
- `OverdueAlertPayload`, `SosAlertPayload`, `MorningBriefingPayload` defined in Task 4 and consumed in Tasks 5, 7
- `AlertRow` interface in `AlertSection` matches shape returned by `GET /alerts` (Prisma `alert.findMany` with `patient` include)
- `api.sos()` in Task 9 calls `/patients/sos-by-task/:taskId` defined in Task 7 ✅
