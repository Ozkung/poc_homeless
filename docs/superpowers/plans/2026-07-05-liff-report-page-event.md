# LIFF Event-based ReportPage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปรับ LIFF ReportPage เป็นหน้าลงตรวจประจำวัน — แสดงผู้ป่วยจาก Event วันนี้ของ zone ตัวเอง พร้อม bottom sheet 2 tabs (แบบสำรวจ + Note) และสร้าง seed data 4 Events ครอบคลุมทุก zone

**Architecture:** Feature-first — backend endpoints → LIFF api.ts → LIFF UI → seed data. Backend เพิ่ม `findTodayZoneTasks` ใน TasksService (ใช้ `preferredZoneId` ของ GUEST user) + 3 GUEST task action endpoints. LIFF แยก AddPage (= ReportPage เดิม) ออกจาก ReportPage ใหม่ที่เป็น patient list + PatientTaskSheet bottom sheet.

**Tech Stack:** NestJS + Prisma + Redis (backend), React + Vite + react-router-dom (LIFF), TypeScript

## Global Constraints

- GUEST role ต้องเข้าถึง endpoint ใหม่ทุกตัวผ่าน JwtAuthGuard
- Authorization บน task action: ตรวจ `patient.zoneId === user.preferredZoneId` (ไม่ใช่ assigneeId)
- Activity ทุกชนิดต้องมี `patientId` set เพื่อให้ขึ้นใน Timeline
- Bottom sheet ใช้ CSS animation ไม่ใช่ library ภายนอก
- Seed IDs ต้องขึ้นต้นด้วย `td-` (today) เพื่อไม่ชน existing seeds

---

## File Map

| File | Action | หน้าที่ |
|---|---|---|
| `apps/backend/src/modules/tasks/tasks.service.ts` | Modify | เพิ่ม `findTodayZoneTasks`, `guestCheckin`, `guestAddNote`, `guestSubmitForm`, helper `getTaskForGuest` |
| `apps/backend/src/modules/tasks/tasks.controller.ts` | Modify | เพิ่ม `GET /events/today/my-tasks` proxy + 3 GUEST endpoints |
| `apps/backend/src/modules/events/events.controller.ts` | Modify | เพิ่ม `GET today/my-tasks` ที่ delegate ไป TasksService |
| `apps/liff/src/lib/api.ts` | Modify | เพิ่ม types + 4 methods |
| `apps/liff/src/pages/AddPage.tsx` | Create | = ReportPage เดิม, back → `/report` |
| `apps/liff/src/pages/ReportPage.tsx` | Rewrite | Patient list จาก today's tasks |
| `apps/liff/src/components/PatientTaskSheet.tsx` | Create | Bottom sheet 2 tabs |
| `apps/liff/src/main.tsx` | Modify | เพิ่ม `/add` route |
| `apps/backend/prisma/seed.ts` | Modify | เพิ่ม 4 today Events + tasks + submissions |

---

## Task 1: Backend — findTodayZoneTasks + GET /events/today/my-tasks

**Files:**
- Modify: `apps/backend/src/modules/tasks/tasks.service.ts`
- Modify: `apps/backend/src/modules/events/events.controller.ts`

**Interfaces:**
- Produces: `TasksService.findTodayZoneTasks(userId: string, orgId: string): Promise<TodayTaskDto[]>`
- Produces: `GET /events/today/my-tasks` returns `TodayTaskDto[]`

```typescript
// TodayTaskDto shape (not a class, just the return type)
{
  taskId: string;
  eventId: string;
  eventTitle: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'NOT_FOUND';
  patient: { id: string; hn: string; name: string; age?: number; status: string; conditions: string[] };
  formTemplate: { id: string; title: string; fields: unknown[] } | null;
}
```

- [ ] **Step 1: เพิ่ม findTodayZoneTasks ใน TasksService**

เปิด `apps/backend/src/modules/tasks/tasks.service.ts` เพิ่ม method ต่อไปนี้ **ก่อน** `findMyTasks` (บรรทัดประมาณ 47):

```typescript
async findTodayZoneTasks(userId: string, orgId: string) {
  const user = await this.prisma.user.findFirst({
    where: { id: userId, organizationId: orgId },
    select: { preferredZoneId: true },
  });
  if (!user?.preferredZoneId) return [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const tasks = await this.prisma.eventTask.findMany({
    where: {
      event: {
        organizationId: orgId,
        startDate: { lte: todayEnd },
        endDate:   { gte: todayStart },
      },
      patient: { zoneId: user.preferredZoneId },
    },
    include: this.TASK_INCLUDE,
    orderBy: { patient: { hn: 'asc' } },
  });

  return tasks.map((t: any) => ({
    taskId:      t.id,
    eventId:     t.event.id,
    eventTitle:  t.event.title,
    status:      t.status,
    patient: {
      id:         t.patient.id,
      hn:         t.patient.hn,
      name:       this.crypto.decrypt(t.patient.nameEnc),
      age:        t.patient.age,
      status:     t.patient.status,
      conditions: t.patient.conditions,
    },
    formTemplate: t.formTemplate ?? null,
  }));
}
```

- [ ] **Step 2: เพิ่ม endpoint GET today/my-tasks ใน EventsController**

เปิด `apps/backend/src/modules/events/events.controller.ts` แก้ไปเป็น:

```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { EventsService } from './events.service';
import { TasksService } from '../tasks/tasks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CASE_MANAGER, UserRole.ADMIN)
export class EventsController {
  constructor(private events: EventsService, private tasks: TasksService) {}

  @Get('today/my-tasks')
  @Roles(UserRole.GUEST, UserRole.CASE_MANAGER, UserRole.ADMIN, UserRole.CARE_GIVER, UserRole.MEDICAL_VOLUNTEER)
  todayMyTasks(@CurrentUser() user: JwtPayload) {
    return this.tasks.findTodayZoneTasks(user.sub, user.orgId);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query('month') month?: string, @Query('year') year?: string) {
    return this.events.findAll(user.orgId, month ? +month : undefined, year ? +year : undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.events.findOne(id, user.orgId);
  }

  @Post()
  create(@Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.events.create(user.orgId, user.sub, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.events.update(id, user.orgId, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.events.remove(id, user.orgId, user.sub);
  }
}
```

**หมายเหตุ:** `@Roles()` บน method-level override `@Roles()` ระดับ class ใน NestJS — ดังนั้น `today/my-tasks` จะเปิดให้ GUEST ได้แม้ class-level จะล็อก CASE_MANAGER/ADMIN

- [ ] **Step 3: ทดสอบด้วย curl (ต้องรัน backend ก่อน)**

```bash
cd apps/backend && npm run start:dev
```

ทดสอบ (ต้องมี GUEST JWT token จาก `/auth/liff/verify`):
```bash
curl http://localhost:3001/events/today/my-tasks \
  -H "Authorization: Bearer <guest-token>"
```

Expected (ถ้า GUEST ยังไม่มี preferredZoneId): `[]`
Expected (ถ้ามี preferredZoneId และมี today Event): `[{ taskId, eventTitle, status, patient, formTemplate }]`

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/tasks/tasks.service.ts \
        apps/backend/src/modules/events/events.controller.ts
git commit -m "feat(backend): add GET /events/today/my-tasks for GUEST zone-based task lookup"
```

---

## Task 2: Backend — GUEST task action endpoints

**Files:**
- Modify: `apps/backend/src/modules/tasks/tasks.service.ts`
- Modify: `apps/backend/src/modules/tasks/tasks.controller.ts`

**Interfaces:**
- Consumes: `findTodayZoneTasks` (Task 1) — same zone auth pattern
- Produces:
  - `TasksService.guestCheckin(taskId, userId, orgId): Promise<{ activityId: string }>`
  - `TasksService.guestAddNote(taskId, userId, orgId, note): Promise<{ activityId: string }>`
  - `TasksService.guestSubmitForm(taskId, userId, orgId, answers): Promise<{ submissionId: string }>`
  - `POST /tasks/:id/guest-checkin` returns `{ activityId: string }`
  - `POST /tasks/:id/guest-note` returns `{ activityId: string }`
  - `POST /tasks/:id/guest-submit` returns `{ submissionId: string }`

- [ ] **Step 1: เพิ่ม import BadRequestException ใน tasks.service.ts**

บรรทัด 1 ของ `apps/backend/src/modules/tasks/tasks.service.ts` แก้เป็น:

```typescript
import { Injectable, NotFoundException, GoneException, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
```

- [ ] **Step 2: เพิ่ม private helper getTaskForGuest**

เพิ่มก่อน `findMyTasks` (ต่อจาก Task 1):

```typescript
private async getTaskForGuest(taskId: string, userId: string, orgId: string) {
  const task = await this.findOne(taskId);
  const [user, patient] = await Promise.all([
    this.prisma.user.findFirst({
      where: { id: userId, organizationId: orgId },
      select: { preferredZoneId: true },
    }),
    this.prisma.patient.findUnique({
      where: { id: task.patientId },
      select: { zoneId: true, organizationId: true },
    }),
  ]);
  if (patient?.organizationId !== orgId) throw new NotFoundException('Task not found');
  if (!user?.preferredZoneId || patient?.zoneId !== user.preferredZoneId) {
    throw new NotFoundException('Task not found');
  }
  return task;
}
```

- [ ] **Step 3: เพิ่ม guestCheckin, guestAddNote, guestSubmitForm**

เพิ่ม 3 methods ต่อไปนี้หลัง `generateLiffToken` (ก่อนปิด class):

```typescript
async guestCheckin(taskId: string, userId: string, orgId: string): Promise<{ activityId: string }> {
  const task = await this.getTaskForGuest(taskId, userId, orgId);
  await this.prisma.eventTask.update({
    where: { id: taskId },
    data: { status: task.status === 'PENDING' ? 'IN_PROGRESS' : task.status },
  });
  const activity = await this.prisma.activity.create({
    data: {
      actorId:   userId,
      patientId: task.patientId,
      taskId,
      eventId:   task.eventId,
      type:      'CHECK_IN',
      payload:   Prisma.DbNull,
    },
  });
  return { activityId: activity.id };
}

async guestAddNote(taskId: string, userId: string, orgId: string, note: string): Promise<{ activityId: string }> {
  const task = await this.getTaskForGuest(taskId, userId, orgId);
  const activity = await this.prisma.activity.create({
    data: {
      actorId:   userId,
      patientId: task.patientId,
      taskId,
      eventId:   task.eventId,
      type:      'NOTE',
      payload:   { note },
    },
  });
  return { activityId: activity.id };
}

async guestSubmitForm(
  taskId: string, userId: string, orgId: string,
  answers: Array<{ fieldId: string; value: string }>,
): Promise<{ submissionId: string }> {
  const task = await this.getTaskForGuest(taskId, userId, orgId);
  if (!task.formTemplateId) throw new BadRequestException('Task has no form template');

  const [submission] = await this.prisma.$transaction([
    this.prisma.submission.create({
      data: {
        taskId,
        patientId:      task.patientId,
        formTemplateId: task.formTemplateId,
        submittedById:  userId,
        answers:        answers as any,
      },
    }),
    this.prisma.activity.create({
      data: {
        actorId:   userId,
        patientId: task.patientId,
        taskId,
        eventId:   task.eventId,
        type:      'FORM_SUBMIT',
        payload:   { formTitle: task.formTemplate?.title ?? 'แบบสำรวจ' },
      },
    }),
    this.prisma.eventTask.update({
      where: { id: taskId },
      data:  { status: 'DONE' },
    }),
  ]);

  return { submissionId: submission.id };
}
```

- [ ] **Step 4: เพิ่ม 3 endpoints ใน TasksController**

เปิด `apps/backend/src/modules/tasks/tasks.controller.ts` เพิ่ม imports และ endpoints:

```typescript
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { SubmissionsService } from '../submissions/submissions.service';
import { SubmitTaskDto } from './dto/submit-task.dto';
import { UserRole } from '@prisma/client';

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private tasks: TasksService, private submissions: SubmissionsService) {}

  @Get('my')
  myTasks(@CurrentUser() user: JwtPayload) {
    return this.tasks.findMyTasks(user.sub);
  }

  @Get('zone')
  zoneTasks(@CurrentUser() user: JwtPayload) {
    return this.tasks.findZoneTasks(user.sub, user.orgId);
  }

  @Post(':id/checkin')
  checkin(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tasks.checkin(id, user.sub);
  }

  @Post(':id/note')
  note(@Param('id') id: string, @Body('note') note: string, @CurrentUser() user: JwtPayload) {
    return this.tasks.addNote(id, user.sub, note);
  }

  @Patch(':id/status')
  status(@Param('id') id: string, @Body('status') status: string, @CurrentUser() user: JwtPayload) {
    return this.tasks.updateStatus(id, user.sub, status);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.CREATED)
  submit(@Param('id') id: string, @Body() dto: SubmitTaskDto, @CurrentUser() user: JwtPayload) {
    return this.submissions.create(user.sub, { taskId: id, token: dto.token, answers: dto.answers });
  }

  // ── GUEST endpoints (zone-based auth, no assignee check) ────────────────

  @Post(':id/guest-checkin')
  @Roles(UserRole.GUEST)
  guestCheckin(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tasks.guestCheckin(id, user.sub, user.orgId);
  }

  @Post(':id/guest-note')
  @Roles(UserRole.GUEST)
  guestNote(
    @Param('id') id: string,
    @Body('note') note: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasks.guestAddNote(id, user.sub, user.orgId, note);
  }

  @Post(':id/guest-submit')
  @Roles(UserRole.GUEST)
  @HttpCode(HttpStatus.CREATED)
  guestSubmit(
    @Param('id') id: string,
    @Body('answers') answers: Array<{ fieldId: string; value: string }>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasks.guestSubmitForm(id, user.sub, user.orgId, answers);
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/tasks/tasks.service.ts \
        apps/backend/src/modules/tasks/tasks.controller.ts
git commit -m "feat(backend): add GUEST check-in, note, submit endpoints for LIFF"
```

---

## Task 3: LIFF — AddPage + routing update

**Files:**
- Create: `apps/liff/src/pages/AddPage.tsx`
- Modify: `apps/liff/src/main.tsx`

**Interfaces:**
- Consumes: existing `api.guestReportPatient()` และ `api.uploadPatientPhoto()`
- Produces: route `/add` → `<AddPage />`

- [ ] **Step 1: สร้าง AddPage.tsx**

สร้างไฟล์ `apps/liff/src/pages/AddPage.tsx` — copy เนื้อหาทั้งหมดจาก `ReportPage.tsx` ปัจจุบัน แล้วแก้ 2 จุด:

1. เปลี่ยน function name: `export default function AddPage()`
2. เปลี่ยน back button + success navigate จาก `navigate('/')` เป็น `navigate('/report')`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const ACCENT = '#6366F1';
const INP: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0',
  borderRadius: 9, fontSize: 14, boxSizing: 'border-box',
  background: '#F8FAFC', color: '#0F172A', outline: 'none', marginTop: 4,
};
const LBL: React.CSSProperties = {
  fontSize: 11, color: '#94A3B8', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.06em',
};

const STATUS_OPTIONS = [
  { value: 'CRITICAL', label: 'L1 ฉุกเฉินวิกฤติ' },
  { value: 'PENDING',  label: 'L2 ฉุกเฉินเร่งด่วน' },
  { value: 'STABLE',   label: 'L3 ไม่เร่งด่วน' },
  { value: 'MISSING',  label: 'L4 ทั่วไป' },
];

export default function AddPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '', lastName: '', nationalId: '', phone: '',
    gender: '', birthDate: '', age: '',
    status: 'PENDING', locationText: '', conditions: '', initialComplaint: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ id: string; hn: string } | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoState, setPhotoState] = useState<'idle' | 'uploading' | 'uploaded' | 'error'>('idle');
  const [photoError, setPhotoError] = useState('');

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setSubmitting(true); setError('');
    try {
      const data = await api.guestReportPatient({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        nationalId: form.nationalId.trim() || undefined,
        phone: form.phone.trim() || undefined,
        gender: form.gender || undefined,
        birthDate: form.birthDate || undefined,
        age: form.age ? parseInt(form.age, 10) : undefined,
        status: form.status || undefined,
        locationText: form.locationText.trim() || undefined,
        conditions: form.conditions.trim()
          ? form.conditions.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
        initialComplaint: form.initialComplaint.trim() || undefined,
      });
      setResult(data);
    } catch (e: any) {
      setError(e.message ?? 'ส่งข้อมูลไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !result) return;
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('รูปใหญ่เกินไป (max 5MB)'); setPhotoState('error'); return;
    }
    setPhotoState('uploading'); setPhotoError('');
    try {
      const data = await api.uploadPatientPhoto(result.id, file);
      setPhotoUrl(data.photoUrl); setPhotoState('uploaded');
    } catch (err: any) {
      setPhotoError(err.message ?? 'อัพโหลดรูปไม่สำเร็จ'); setPhotoState('error');
    }
  }

  const valid = form.firstName.trim().length > 0;

  if (result) return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 320, width: '100%' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 34 }}>✅</div>
        <h2 style={{ fontWeight: 700, fontSize: 18, color: '#0F172A', marginBottom: 8 }}>ส่งข้อมูลสำเร็จ</h2>
        <p style={{ fontSize: 14, color: '#64748B', marginBottom: 4 }}>ทีมงานจะติดตามผู้ป่วยรายนี้</p>
        <p style={{ fontSize: 20, fontWeight: 800, color: ACCENT, marginBottom: 24 }}>{result.hn}</p>
        {photoState === 'uploaded' && photoUrl ? (
          <div style={{ marginBottom: 20 }}>
            <img src={`${import.meta.env.VITE_API_URL}${photoUrl}`} alt="รูปผู้ป่วย"
              style={{ width: 120, height: 120, borderRadius: 12, objectFit: 'cover', border: '2px solid #E2E8F0' }} />
            <p style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>บันทึกรูปผู้ป่วยแล้ว</p>
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <input id="patient-photo-input" type="file" accept="image/*" capture="environment"
              style={{ display: 'none' }} onChange={handlePhoto} />
            <label htmlFor="patient-photo-input" style={{
              display: 'inline-block', padding: '10px 24px',
              background: photoState === 'uploading' ? '#CBD5E1' : '#F1F5F9',
              color: photoState === 'uploading' ? '#94A3B8' : '#334155',
              border: '1px dashed #CBD5E1', borderRadius: 10, fontWeight: 600, fontSize: 14,
              cursor: photoState === 'uploading' ? 'default' : 'pointer',
              pointerEvents: photoState === 'uploading' ? 'none' : 'auto' as any,
            }}>
              {photoState === 'uploading' ? 'กำลังอัพโหลด...' : '📷 ถ่ายรูปผู้ป่วย'}
            </label>
            {photoState === 'error' && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 12, color: '#EF4444', margin: '0 0 6px' }}>{photoError}</p>
                <label htmlFor="patient-photo-input" style={{ fontSize: 12, color: ACCENT, cursor: 'pointer', textDecoration: 'underline' }}>ลองใหม่</label>
              </div>
            )}
            {photoState === 'idle' && <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>ไม่บังคับ — สามารถข้ามได้</p>}
          </div>
        )}
        <button onClick={() => navigate('/report')}
          style={{ padding: '12px 32px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
          กลับหน้าลงตรวจ
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: 16, paddingTop: 24, maxWidth: 480, margin: '0 auto', paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => navigate('/report')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748B', padding: 0 }}>←</button>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0 }}>เพิ่มผู้ป่วยใหม่</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={LBL}>ชื่อ *</label><input style={INP} value={form.firstName} onChange={set('firstName')} placeholder="สมชาย" /></div>
          <div style={{ flex: 1 }}><label style={LBL}>นามสกุล</label><input style={INP} value={form.lastName} onChange={set('lastName')} placeholder="ใจดี" /></div>
        </div>
        <div><label style={LBL}>เลขบัตรประชาชน</label><input style={INP} value={form.nationalId} onChange={set('nationalId')} placeholder="1234567890123" maxLength={13} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={LBL}>เบอร์โทรศัพท์</label><input style={INP} type="tel" value={form.phone} onChange={set('phone')} placeholder="081-234-5678" /></div>
          <div style={{ flex: 1 }}><label style={LBL}>เพศ</label>
            <select style={{ ...INP, appearance: 'none' } as React.CSSProperties} value={form.gender} onChange={set('gender')}>
              <option value="">— ไม่ระบุ —</option><option value="MALE">ชาย</option><option value="FEMALE">หญิง</option><option value="OTHER">อื่นๆ</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={LBL}>วันเกิด</label><input style={INP} type="date" value={form.birthDate} onChange={set('birthDate')} /></div>
          <div style={{ flex: 1 }}><label style={LBL}>อายุ (ปี)</label><input style={INP} type="number" min="0" max="150" value={form.age} onChange={set('age')} placeholder="ปี" /></div>
        </div>
        <div><label style={LBL}>สถานะ (Triage)</label>
          <select style={{ ...INP, appearance: 'none' } as React.CSSProperties} value={form.status} onChange={set('status')}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div><label style={LBL}>สถานที่ที่พบ</label><input style={INP} value={form.locationText} onChange={set('locationText')} placeholder="เช่น ใต้สะพาน ถ.พระราม 4" /></div>
        <div>
          <label style={LBL}>โรคประจำตัว</label>
          <input style={INP} value={form.conditions} onChange={set('conditions')} placeholder="เบาหวาน, ความดัน" />
          <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0' }}>คั่นด้วยเครื่องหมายจุลภาค</p>
        </div>
        <div>
          <label style={LBL}>อาการเบื้องต้น</label>
          <textarea style={{ ...INP, minHeight: 80, resize: 'vertical' } as React.CSSProperties}
            value={form.initialComplaint} onChange={set('initialComplaint')}
            placeholder="เช่น ปวดศีรษะ เวียนหัว อ่อนเพลีย มา 3 วัน..." />
        </div>
      </div>
      {error && <p style={{ color: '#EF4444', fontSize: 13, marginTop: 12 }}>{error}</p>}
      <button disabled={!valid || submitting} onClick={submit}
        style={{ width: '100%', marginTop: 24, padding: '12px', background: valid && !submitting ? ACCENT : '#CBD5E1', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: valid && !submitting ? 'pointer' : 'default' }}>
        {submitting ? 'กำลังบันทึก...' : 'บันทึกผู้ป่วย'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: เพิ่ม /add route ใน main.tsx**

เปิด `apps/liff/src/main.tsx` แก้ไป:

```tsx
import AddPage from './pages/AddPage';

// ใน <Routes>:
<Route path="/"         element={<HomePage />} />
<Route path="/register" element={<RegisterPage />} />
<Route path="/profile"  element={<ProfilePage />} />
<Route path="/report"   element={<ReportPage />} />
<Route path="/add"      element={<AddPage />} />
```

- [ ] **Step 3: ตรวจ TypeScript**

```bash
cd apps/liff && npx tsc --noEmit
```

Expected: ไม่มี error

- [ ] **Step 4: Commit**

```bash
git add apps/liff/src/pages/AddPage.tsx apps/liff/src/main.tsx
git commit -m "feat(liff): add AddPage for guest-report, wire /add route"
```

---

## Task 4: LIFF — api.ts new methods + types

**Files:**
- Modify: `apps/liff/src/lib/api.ts`

**Interfaces:**
- Produces:
```typescript
interface TodayTask {
  taskId: string; eventId: string; eventTitle: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'NOT_FOUND';
  patient: { id: string; hn: string; name: string; age?: number; status: string; conditions: string[] };
  formTemplate: { id: string; title: string; fields: FormField[] } | null;
}
interface FormField {
  id: string; type: 'number' | 'text' | 'textarea' | 'radio' | 'select' | 'scale';
  label: string; required: boolean; order: number;
  options?: string[]; min?: number; max?: number;
}
```

- [ ] **Step 1: เพิ่ม types และ 4 methods ใน api.ts**

เปิด `apps/liff/src/lib/api.ts` แก้ไปเป็น (เพิ่ม types หลัง imports และ methods ใน api object):

หลัง `export function getToken()` เพิ่ม:
```typescript
export interface FormField {
  id: string;
  type: 'number' | 'text' | 'textarea' | 'radio' | 'select' | 'scale';
  label: string;
  required: boolean;
  order: number;
  options?: string[];
  min?: number;
  max?: number;
}

export interface TodayTask {
  taskId: string;
  eventId: string;
  eventTitle: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'NOT_FOUND';
  patient: {
    id: string; hn: string; name: string;
    age?: number; status: string; conditions: string[];
  };
  formTemplate: { id: string; title: string; fields: FormField[] } | null;
}
```

ใน `export const api = { ... }` เพิ่มก่อน `}`:
```typescript
getTodayTasks: () =>
  request<TodayTask[]>('/events/today/my-tasks'),

guestCheckin: (taskId: string) =>
  request<{ activityId: string }>(`/tasks/${taskId}/guest-checkin`, { method: 'POST' }),

guestAddNote: (taskId: string, note: string) =>
  request<{ activityId: string }>(`/tasks/${taskId}/guest-note`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  }),

guestSubmitForm: (taskId: string, answers: Array<{ fieldId: string; value: string }>) =>
  request<{ submissionId: string }>(`/tasks/${taskId}/guest-submit`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  }),

uploadPatientPhoto: async (patientId: string, file: File): Promise<{ photoUrl: string }> => {
  const formData = new FormData();
  formData.append('photo', file);
  const res = await fetch(`${API_URL}/patients/${patientId}/photo`, {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error((err as any).message ?? 'อัพโหลดรูปไม่สำเร็จ'), { status: res.status });
  }
  return res.json();
},
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/liff && npx tsc --noEmit
```

Expected: ไม่มี error

- [ ] **Step 3: Commit**

```bash
git add apps/liff/src/lib/api.ts
git commit -m "feat(liff): add getTodayTasks, guestCheckin, guestAddNote, guestSubmitForm to api"
```

---

## Task 5: LIFF — PatientTaskSheet component

**Files:**
- Create: `apps/liff/src/components/PatientTaskSheet.tsx`

**Interfaces:**
- Consumes: `TodayTask`, `FormField` (จาก Task 4), `api.guestCheckin`, `api.guestAddNote`, `api.guestSubmitForm`
- Produces: `<PatientTaskSheet task={TodayTask} onClose={() => void} onStatusChange={(taskId, status) => void} />`

- [ ] **Step 1: สร้าง PatientTaskSheet.tsx**

สร้าง `apps/liff/src/components/PatientTaskSheet.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { api, TodayTask } from '../lib/api';

const ACCENT = '#6366F1';

const STATUS_COLOR: Record<string, string> = {
  CRITICAL: '#EF4444', PENDING: '#F59E0B', STABLE: '#22C55E', MISSING: '#94A3B8',
};
const STATUS_LABEL: Record<string, string> = {
  CRITICAL: 'L1 วิกฤติ', PENDING: 'L2 เร่งด่วน', STABLE: 'L3 ปกติ', MISSING: 'L4 ไม่พบ',
};

interface Props {
  task: TodayTask;
  onClose: () => void;
  onStatusChange: (taskId: string, status: string) => void;
}

export default function PatientTaskSheet({ task, onClose, onStatusChange }: Props) {
  const [tab, setTab] = useState<'form' | 'note'>('form');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checkinState, setCheckinState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [note, setNote] = useState('');
  const [noteState, setNoteState] = useState<'idle' | 'loading'>('idle');
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const fields = task.formTemplate?.fields ?? [];
  const requiredIds = fields.filter((f) => f.required).map((f) => f.id);
  const formValid = requiredIds.every((id) => (answers[id] ?? '').toString().trim() !== '');

  async function handleCheckin() {
    if (checkinState !== 'idle') return;
    setCheckinState('loading'); setError('');
    try {
      await api.guestCheckin(task.taskId);
      setCheckinState('done');
      onStatusChange(task.taskId, 'IN_PROGRESS');
    } catch (e: any) {
      setError(e.message ?? 'Check-in ล้มเหลว');
      setCheckinState('idle');
    }
  }

  async function handleSubmitForm() {
    if (submitState !== 'idle' || !formValid) return;
    setSubmitState('loading'); setError('');
    try {
      const ans = Object.entries(answers).map(([fieldId, value]) => ({ fieldId, value }));
      await api.guestSubmitForm(task.taskId, ans);
      setSubmitState('done');
      onStatusChange(task.taskId, 'DONE');
    } catch (e: any) {
      setError(e.message ?? 'ส่งแบบสำรวจไม่สำเร็จ');
      setSubmitState('idle');
    }
  }

  async function handleNote() {
    if (!note.trim() || noteState === 'loading') return;
    setNoteState('loading'); setError('');
    try {
      await api.guestAddNote(task.taskId, note.trim());
      setNotes((prev) => [note.trim(), ...prev]);
      setNote('');
      setNoteState('idle');
    } catch (e: any) {
      setError(e.message ?? 'บันทึก Note ไม่สำเร็จ');
      setNoteState('idle');
    }
  }

  function renderField(f: typeof fields[0]) {
    const val = answers[f.id] ?? '';
    const set = (v: string) => setAnswers((a) => ({ ...a, [f.id]: v }));
    const base: React.CSSProperties = {
      width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0',
      borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
      background: '#F8FAFC', color: '#0F172A', marginTop: 4, outline: 'none',
    };
    if (f.type === 'textarea')
      return <textarea key={f.id} style={{ ...base, minHeight: 72, resize: 'vertical' } as React.CSSProperties}
        value={val} onChange={(e) => set(e.target.value)} />;
    if (f.type === 'radio' && f.options)
      return (
        <div key={f.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          {f.options.map((o) => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, cursor: 'pointer' }}>
              <input type="radio" checked={val === o} onChange={() => set(o)} /> {o}
            </label>
          ))}
        </div>
      );
    if (f.type === 'select' && f.options)
      return (
        <select key={f.id} style={{ ...base, appearance: 'none' } as React.CSSProperties}
          value={val} onChange={(e) => set(e.target.value)}>
          <option value="">— เลือก —</option>
          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    if (f.type === 'scale')
      return (
        <div key={f.id} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {Array.from({ length: (f.max ?? 5) - (f.min ?? 1) + 1 }, (_, i) => String((f.min ?? 1) + i)).map((n) => (
            <button key={n} onClick={() => set(n)}
              style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #E2E8F0', background: val === n ? ACCENT : '#F8FAFC', color: val === n ? '#fff' : '#374151', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
              {n}
            </button>
          ))}
        </div>
      );
    return <input key={f.id} type={f.type === 'number' ? 'number' : 'text'} style={base}
      value={val} onChange={(e) => set(e.target.value)} />;
  }

  return (
    <>
      {/* Backdrop */}
      <div ref={backdropRef} onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100 }} />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
        background: '#fff', borderRadius: '20px 20px 0 0',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        animation: 'slideUp 0.25s ease-out',
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E2E8F0' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '8px 16px 12px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0 }}>{task.patient.name}</p>
              <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>{task.patient.hn}</p>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
              background: STATUS_COLOR[task.patient.status] + '20',
              color: STATUS_COLOR[task.patient.status],
            }}>
              {STATUS_LABEL[task.patient.status] ?? task.patient.status}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9' }}>
          {(['form', 'note'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                color: tab === t ? ACCENT : '#94A3B8',
                borderBottom: tab === t ? `2px solid ${ACCENT}` : '2px solid transparent',
              }}>
              {t === 'form' ? 'แบบสำรวจ' : 'Note'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {error && <p style={{ color: '#EF4444', fontSize: 12, marginBottom: 8 }}>{error}</p>}

          {tab === 'form' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {fields.length === 0
                ? <p style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>ไม่มีแบบสำรวจสำหรับ task นี้</p>
                : fields
                    .sort((a, b) => a.order - b.order)
                    .map((f) => (
                      <div key={f.id}>
                        <label style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                          {f.label}{f.required ? ' *' : ''}
                        </label>
                        {renderField(f)}
                      </div>
                    ))
              }

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={handleCheckin} disabled={checkinState === 'loading'}
                  style={{
                    flex: 1, padding: '11px 0', border: `1px solid ${ACCENT}`, borderRadius: 10,
                    background: checkinState === 'done' ? '#F0FDF4' : '#fff',
                    color: checkinState === 'done' ? '#16A34A' : ACCENT,
                    fontWeight: 700, fontSize: 14, cursor: checkinState === 'loading' ? 'default' : 'pointer',
                  }}>
                  {checkinState === 'loading' ? '...' : checkinState === 'done' ? '✓ Check-in แล้ว' : 'Check-in'}
                </button>
                <button onClick={handleSubmitForm} disabled={!formValid || submitState !== 'idle'}
                  style={{
                    flex: 2, padding: '11px 0', border: 'none', borderRadius: 10,
                    background: submitState === 'done' ? '#F0FDF4' : (formValid && submitState === 'idle') ? ACCENT : '#CBD5E1',
                    color: submitState === 'done' ? '#16A34A' : '#fff',
                    fontWeight: 700, fontSize: 14, cursor: (!formValid || submitState !== 'idle') ? 'default' : 'pointer',
                  }}>
                  {submitState === 'loading' ? 'กำลังส่ง...' : submitState === 'done' ? '✓ ส่งแล้ว' : 'ส่งแบบสำรวจ'}
                </button>
              </div>
            </div>
          )}

          {tab === 'note' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <textarea
                value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="บันทึกข้อสังเกต สภาพผู้ป่วย หรือข้อมูลเพิ่มเติม..."
                style={{ width: '100%', minHeight: 100, padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
              />
              <button onClick={handleNote} disabled={!note.trim() || noteState === 'loading'}
                style={{
                  padding: '11px', border: 'none', borderRadius: 10,
                  background: note.trim() && noteState === 'idle' ? ACCENT : '#CBD5E1',
                  color: '#fff', fontWeight: 700, fontSize: 14,
                  cursor: !note.trim() || noteState === 'loading' ? 'default' : 'pointer',
                }}>
                {noteState === 'loading' ? 'กำลังบันทึก...' : 'บันทึก Note'}
              </button>

              {notes.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>บันทึกในวันนี้</p>
                  {notes.map((n, i) => (
                    <div key={i} style={{ padding: '8px 12px', background: '#F8FAFC', borderRadius: 8, marginBottom: 6, fontSize: 13, color: '#374151' }}>
                      {n}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/liff && npx tsc --noEmit
```

Expected: ไม่มี error

- [ ] **Step 3: Commit**

```bash
git add apps/liff/src/components/PatientTaskSheet.tsx
git commit -m "feat(liff): add PatientTaskSheet bottom sheet component"
```

---

## Task 6: LIFF — ReportPage redesign

**Files:**
- Modify: `apps/liff/src/pages/ReportPage.tsx`

**Interfaces:**
- Consumes: `api.getTodayTasks()` (Task 4), `<PatientTaskSheet>` (Task 5), `TodayTask` type (Task 4)
- Consumes: `useProfileStore` (existing) — `systemProfile.preferredZoneId`

- [ ] **Step 1: Rewrite ReportPage.tsx**

แทนที่ `apps/liff/src/pages/ReportPage.tsx` ทั้งหมดด้วย:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, TodayTask } from '../lib/api';
import { useProfileStore } from '../store/profileStore';
import PatientTaskSheet from '../components/PatientTaskSheet';

const ACCENT = '#6366F1';

const TASK_STATUS_LABEL: Record<string, string> = {
  PENDING: 'รอดำเนินการ', IN_PROGRESS: 'กำลังดำเนินการ', DONE: 'เสร็จแล้ว', NOT_FOUND: 'ไม่พบผู้ป่วย',
};
const TASK_STATUS_COLOR: Record<string, string> = {
  PENDING: '#F59E0B', IN_PROGRESS: '#3B82F6', DONE: '#22C55E', NOT_FOUND: '#94A3B8',
};
const PAT_STATUS_COLOR: Record<string, string> = {
  CRITICAL: '#EF4444', PENDING: '#F59E0B', STABLE: '#22C55E', MISSING: '#94A3B8',
};
const PAT_STATUS_LABEL: Record<string, string> = {
  CRITICAL: 'L1', PENDING: 'L2', STABLE: 'L3', MISSING: 'L4',
};

export default function ReportPage() {
  const navigate = useNavigate();
  const { systemProfile } = useProfileStore();
  const [tasks, setTasks] = useState<TodayTask[]>([]);
  const [state, setState] = useState<'loading' | 'no-zone' | 'no-event' | 'list'>('loading');
  const [selected, setSelected] = useState<TodayTask | null>(null);

  useEffect(() => {
    if (!systemProfile) return;
    if (!systemProfile.preferredZoneId) { setState('no-zone'); return; }

    api.getTodayTasks()
      .then((data) => {
        setTasks(data);
        setState(data.length === 0 ? 'no-event' : 'list');
      })
      .catch(() => setState('no-event'));
  }, [systemProfile]);

  function handleStatusChange(taskId: string, status: string) {
    setTasks((prev) => prev.map((t) => t.taskId === taskId ? { ...t, status: status as any } : t));
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '16px 16px 12px', borderBottom: '1px solid #F1F5F9', position: 'sticky', top: 0, zIndex: 10 }}>
        <h1 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0 }}>ลงตรวจวันนี้</h1>
        {systemProfile?.preferredZone && (
          <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>{systemProfile.preferredZone.name}</p>
        )}
      </div>

      {/* States */}
      {state === 'loading' && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: '#94A3B8', fontSize: 14 }}>กำลังโหลด...</p>
        </div>
      )}

      {state === 'no-zone' && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>📍</p>
          <p style={{ fontWeight: 600, color: '#374151', fontSize: 15, marginBottom: 8 }}>ยังไม่ได้ตั้งค่าพื้นที่</p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 20 }}>กรุณาตั้งค่า Zone ก่อนใช้งาน</p>
          <button onClick={() => navigate('/profile')}
            style={{ padding: '10px 24px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            ตั้งค่าโปรไฟล์
          </button>
        </div>
      )}

      {state === 'no-event' && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>📋</p>
          <p style={{ fontWeight: 600, color: '#374151', fontSize: 15, marginBottom: 4 }}>ไม่มีการลงตรวจวันนี้</p>
          <p style={{ fontSize: 13, color: '#94A3B8' }}>ในพื้นที่ของคุณยังไม่มี Event วันนี้</p>
        </div>
      )}

      {state === 'list' && (
        <div style={{ padding: 12 }}>
          <p style={{ fontSize: 12, color: '#94A3B8', marginBottom: 10, fontWeight: 600 }}>
            {tasks[0]?.eventTitle} · {tasks.length} ราย
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tasks.map((t) => (
              <div key={t.taskId} onClick={() => setSelected(t)}
                style={{
                  background: '#fff', borderRadius: 14, padding: '14px 16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.07)', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  opacity: t.status === 'DONE' ? 0.6 : 1,
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                      background: PAT_STATUS_COLOR[t.patient.status] + '20',
                      color: PAT_STATUS_COLOR[t.patient.status],
                    }}>
                      {PAT_STATUS_LABEL[t.patient.status]}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.patient.name}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{t.patient.hn}</p>
                  {t.patient.conditions.length > 0 && (
                    <p style={{ fontSize: 11, color: '#64748B', margin: '4px 0 0' }}>{t.patient.conditions.slice(0, 2).join(', ')}</p>
                  )}
                </div>
                <div style={{ flexShrink: 0, marginLeft: 12, textAlign: 'right' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                    background: TASK_STATUS_COLOR[t.status] + '15',
                    color: TASK_STATUS_COLOR[t.status],
                  }}>
                    {TASK_STATUS_LABEL[t.status]}
                  </span>
                  <p style={{ fontSize: 18, color: '#CBD5E1', margin: '4px 0 0' }}>›</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FAB — เพิ่มผู้ป่วย */}
      <button onClick={() => navigate('/add')}
        style={{
          position: 'fixed', bottom: 24, right: 20, width: 52, height: 52,
          borderRadius: '50%', background: ACCENT, color: '#fff', border: 'none',
          fontSize: 26, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50,
        }}>
        +
      </button>

      {/* Bottom Sheet */}
      {selected && (
        <PatientTaskSheet
          task={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/liff && npx tsc --noEmit
```

Expected: ไม่มี error

- [ ] **Step 3: Build check**

```bash
cd apps/liff && npm run build
```

Expected: build สำเร็จไม่มี error

- [ ] **Step 4: Commit**

```bash
git add apps/liff/src/pages/ReportPage.tsx
git commit -m "feat(liff): redesign ReportPage as today-event patient list with bottom sheet"
```

---

## Task 7: Seed Data — 4 Today Events + Tasks + Submissions

**Files:**
- Modify: `apps/backend/prisma/seed.ts`

**Interfaces:**
- Consumes: existing IDs — `zone-seed-001..004`, `pat-seed-001..008`, `user-seed-guest1..3`, `user-seed-cm1..2`, `form-seed-001`
- Produces: events `evt-today-001..004`, tasks `tk-td-*`, submissions `sub-td-*`, `pat-seed-liff-001`

- [ ] **Step 1: เพิ่ม seed code ใน main() ของ seed.ts**

เปิด `apps/backend/prisma/seed.ts` หา comment `// ── Activities` (ประมาณบรรทัด 580) แล้วเพิ่ม section ใหม่ก่อนมัน:

```typescript
// ── Today Events (ลงตรวจประจำวัน) ─────────────────────────────────────────
// Set GUEST preferredZoneId เพื่อทดสอบ zone-based filtering
await Promise.all([
  prisma.user.update({ where: { id: 'user-seed-guest1' }, data: { preferredZoneId: 'zone-seed-001' } }),
  prisma.user.update({ where: { id: 'user-seed-guest2' }, data: { preferredZoneId: 'zone-seed-001' } }),
  prisma.user.update({ where: { id: 'user-seed-guest3' }, data: { preferredZoneId: 'zone-seed-002' } }),
]);

const todayStart = new Date(); todayStart.setHours(8, 0, 0, 0);
const todayEnd   = new Date(); todayEnd.setHours(20, 0, 0, 0);

const evtToday1 = await prisma.event.upsert({
  where:  { id: 'evt-today-001' },
  update: {},
  create: {
    id: 'evt-today-001', organizationId: org.id, createdById: cm1.id,
    title: 'ลงตรวจ เขตพระนคร', startDate: todayStart, endDate: todayEnd, priority: 'URGENT',
    note: 'ลงพื้นที่ตรวจเยี่ยมผู้ป่วยเขตพระนคร',
  },
});
const evtToday2 = await prisma.event.upsert({
  where:  { id: 'evt-today-002' },
  update: {},
  create: {
    id: 'evt-today-002', organizationId: org.id, createdById: cm1.id,
    title: 'ลงตรวจ เขตป้อมปราบฯ', startDate: todayStart, endDate: todayEnd, priority: 'URGENT',
    note: 'ลงพื้นที่ตรวจเยี่ยมผู้ป่วยเขตป้อมปราบศัตรูพ่าย',
  },
});
const evtToday3 = await prisma.event.upsert({
  where:  { id: 'evt-today-003' },
  update: {},
  create: {
    id: 'evt-today-003', organizationId: org.id, createdById: cm2.id,
    title: 'ลงตรวจ เขตหนองจอก', startDate: todayStart, endDate: todayEnd, priority: 'URGENT',
    note: 'ลงพื้นที่ตรวจเยี่ยมผู้ป่วยเขตหนองจอก',
  },
});
const evtToday4 = await prisma.event.upsert({
  where:  { id: 'evt-today-004' },
  update: {},
  create: {
    id: 'evt-today-004', organizationId: org.id, createdById: cm1.id,
    title: 'ลงตรวจ เขตสัมพันธวงศ์', startDate: todayStart, endDate: todayEnd, priority: 'URGENT',
    note: 'ลงพื้นที่ตรวจเยี่ยมผู้ป่วยเขตสัมพันธวงศ์',
  },
});
void evtToday1; void evtToday2; void evtToday3; void evtToday4;

// Tasks — zone-seed-001: pat-001 (DONE), pat-003 (DONE), pat-007 (DONE)
await mkTask('tk-td-01-1', 'evt-today-001', 'pat-seed-001', cm1.id, form1.id, 'DONE',      todayStart);
await mkTask('tk-td-01-2', 'evt-today-001', 'pat-seed-003', cm2.id, form1.id, 'DONE',      todayStart);
await mkTask('tk-td-01-3', 'evt-today-001', 'pat-seed-007', cm2.id, form1.id, 'DONE',      todayStart);
// Tasks — zone-seed-002: pat-002 (PENDING), pat-008 (PENDING)
await mkTask('tk-td-02-1', 'evt-today-002', 'pat-seed-002', cm1.id, form1.id, 'PENDING',   todayStart);
await mkTask('tk-td-02-2', 'evt-today-002', 'pat-seed-008', cm1.id, form1.id, 'PENDING',   todayStart);
// Tasks — zone-seed-003: pat-004 (PENDING), pat-006 (IN_PROGRESS)
await mkTask('tk-td-03-1', 'evt-today-003', 'pat-seed-004', cm2.id, form1.id, 'PENDING',   todayStart);
await mkTask('tk-td-03-2', 'evt-today-003', 'pat-seed-006', cm2.id, form1.id, 'IN_PROGRESS', todayStart);
// Tasks — zone-seed-004: pat-005 (PENDING)
await mkTask('tk-td-04-1', 'evt-today-004', 'pat-seed-005', cm1.id, form1.id, 'PENDING',   todayStart);

// Submissions for zone-001 tasks (simulate already completed)
const g1 = await prisma.user.findUnique({ where: { id: 'user-seed-guest1' } });
const g2 = await prisma.user.findUnique({ where: { id: 'user-seed-guest2' } });
if (g1) {
  await mkSubmission('sub-td-01-1', 'tk-td-01-1', 'pat-seed-001', form1.id, g1.id,
    answers1('72', '168', '145', '92', '6', 'ผู้ป่วยอ่อนแรง หน้าซีด แน่นหน้าอก'), todayStart);
  await mkSubmission('sub-td-01-3', 'tk-td-01-3', 'pat-seed-007', form1.id, g1.id,
    answers1('65', '162', '138', '85', '4', 'ผู้ป่วยเดินลำบาก ปวดเข่า'), todayStart);
}
if (g2) {
  await mkSubmission('sub-td-01-2', 'tk-td-01-2', 'pat-seed-003', form1.id, g2.id,
    answers1('58', '160', '122', '78', '3', 'สุขภาพทรงตัว ขอยาแก้ปวดข้อ'), todayStart);
}

// ผู้ป่วยใหม่ที่เพิ่มผ่าน LIFF (simulate guest-report)
const liffHn = 'HN-LIFF-001';
const existingLiff = await prisma.patient.findUnique({ where: { hn: liffHn } });
if (!existingLiff && g1) {
  await prisma.patient.create({
    data: {
      id: 'pat-seed-liff-001',
      organizationId: org.id,
      nameEnc: encrypt('นายทดสอบ ลงพื้นที่'),
      hn: liffHn,
      age: 35, gender: 'MALE', status: 'PENDING',
      conditions: [],
      locationText: 'สนามหลวง บริเวณลานคนเมือง',
      zoneId: 'zone-seed-001',
      reportedById: g1.id,
    },
  });
}

console.log(`✓ Today Events: 4 records (evt-today-001..004)`);
console.log(`✓ Today Tasks: 8 records`);
console.log(`✓ Today Submissions: 3 records (zone-001 done)`);
console.log(`✓ LIFF patient: pat-seed-liff-001`);
```

- [ ] **Step 2: รัน seed**

```bash
cd apps/backend && npx prisma db seed
```

Expected output (ท้าย):
```
✓ Today Events: 4 records (evt-today-001..004)
✓ Today Tasks: 8 records
✓ Today Submissions: 3 records (zone-001 done)
✓ LIFF patient: pat-seed-liff-001
```

- [ ] **Step 3: ตรวจผ่าน API (backend ต้องรัน)**

```bash
# ดึง today tasks สำหรับ guest1 (preferredZoneId = zone-seed-001)
curl http://localhost:3001/events/today/my-tasks \
  -H "Authorization: Bearer <guest1-token>"
```

Expected: array 3 items (pat-001, pat-003, pat-007 ทั้งหมด status=DONE)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/prisma/seed.ts
git commit -m "seed: add today Events, tasks, submissions for all 4 zones + LIFF patient"
```

---

## Self-Review

**Spec coverage:**
- ✅ `GET /events/today/my-tasks` zone-based (preferredZoneId) — Task 1
- ✅ Check-in แยก / Submit Form แยก — Task 2 + Task 5
- ✅ Note tab กด submit ได้หลายครั้ง — Task 5
- ✅ Activity มี patientId (Timeline update) — Task 2
- ✅ Bottom sheet slide-up — Task 5
- ✅ AddPage = ReportPage เดิม — Task 3
- ✅ `/add` route — Task 3
- ✅ FAB "+" ใน ReportPage → `/add` — Task 6
- ✅ No-zone state → link ไป /profile — Task 6
- ✅ No-event state — Task 6
- ✅ 4 Today Events per zone — Task 7
- ✅ 3 Submissions zone-001 (DONE), 5 PENDING — Task 7
- ✅ GUEST preferredZoneId set — Task 7
- ✅ LIFF patient (reportedById) — Task 7
- ✅ api.ts 4 new methods + types — Task 4

**Type consistency:**
- `TodayTask` defined Task 4 (api.ts), consumed Task 5 + 6 ✅
- `FormField` defined Task 4, used in `renderField` Task 5 ✅
- `guestCheckin(taskId)` — Task 4 defines, Task 5 calls ✅
- `guestAddNote(taskId, note)` — Task 4 defines, Task 5 calls ✅
- `guestSubmitForm(taskId, answers)` — Task 4 defines, Task 5 calls ✅
- `onStatusChange(taskId, status)` — Task 5 produces, Task 6 consumes ✅
