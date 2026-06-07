# Triage Escalation & Alerts — Spec

**Date:** 2026-06-08
**Status:** Approved
**Sub-system:** 1 of 7 (CareLink journey map)

## Goal

Monitor ว่าผู้ป่วยแต่ละคนถูก visit ครั้งล่าสุดเมื่อไหร่ ถ้าเกินกำหนดตาม triage level → แจ้ง CM ทั้ง Dashboard และ LINE, mark `MISSING` เมื่อเกิน threshold สูงสุด, แจ้ง Caregiver ทาง LINE ทุก 08:00 ว่าผู้ป่วยคนไหน due วันนี้, และรองรับ SOS button ใน LIFF ที่ส่ง alert ถึง CM ทันที

## Approach

Alert-only (monitor + alert ไม่ auto-create tasks) + NestJS `@nestjs/schedule` cron jobs + Bull queue สำหรับ LINE push

---

## Triage Thresholds

| Status | Visit ทุก | Alert CM หลัง | Mark MISSING หลัง |
|--------|-----------|--------------|-------------------|
| CRITICAL | 2 วัน | 1 วัน | 5 วัน |
| PENDING | 4 วัน | 2 วัน | 14 วัน |
| STABLE | 7 วัน | 3 วัน | 30 วัน |

---

## Schema Changes

### PatientStatus enum — เพิ่ม MISSING

```prisma
enum PatientStatus {
  CRITICAL
  PENDING
  STABLE
  MISSING   // ← ใหม่
}
```

### ActivityType enum — เพิ่ม SOS

```prisma
enum ActivityType {
  CHECK_IN
  NOTE
  FORM_SUBMIT
  ASSIGN
  STATUS_CHANGE
  LOGIN
  LOGOUT
  SOS         // ← ใหม่
}
```

### Alert model — ใหม่

```prisma
enum AlertType {
  OVERDUE
  MISSING
  SOS
}

model Alert {
  id          String      @id @default(uuid())
  patientId   String
  patient     Patient     @relation(fields: [patientId], references: [id], onDelete: Cascade)
  type        AlertType
  daysMissed  Int?        // จำนวนวันที่เกินกำหนด (สำหรับ OVERDUE/MISSING)
  lat         Float?      // สำหรับ SOS
  lng         Float?
  sentAt      DateTime    @default(now())
  resolvedAt  DateTime?
  resolvedBy  String?     // userId ที่ mark resolved
}
```

`Patient` model เพิ่ม relation:
```prisma
alerts Alert[]
```

### Fix: checkin สร้าง Activity

`tasks.service.ts` checkin() ปัจจุบันไม่สร้าง Activity → เพิ่มให้ create `ActivityType.CHECK_IN` หลัง update status เพื่อให้ escalation logic query last visit ได้ถูกต้อง

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `apps/backend/prisma/schema.prisma` | เพิ่ม MISSING, SOS, Alert model |
| Migrate | `prisma migrate dev` | apply schema changes |
| Create | `apps/backend/src/modules/alerts/alerts.module.ts` | register ScheduleModule + deps |
| Create | `apps/backend/src/modules/alerts/alerts.service.ts` | cron jobs + escalation logic |
| Create | `apps/backend/src/modules/alerts/alerts.controller.ts` | `GET /alerts` for CM dashboard |
| Modify | `apps/backend/src/app.module.ts` | import AlertsModule |
| Modify | `apps/backend/src/modules/tasks/tasks.service.ts` | fix checkin() to create Activity |
| Modify | `apps/backend/src/modules/notifications/notifications.service.ts` | เพิ่ม enqueue methods ใหม่ |
| Modify | `apps/backend/src/modules/notifications/notifications.processor.ts` | handle job types ใหม่ |
| Create | `apps/backend/src/modules/patients/dto/sos.dto.ts` | SOS request DTO |
| Modify | `apps/backend/src/modules/patients/patients.controller.ts` | `POST /patients/:id/sos` |
| Modify | `apps/backend/src/modules/patients/patients.service.ts` | `createSos()` method |
| Modify | `apps/frontend/src/app/(app)/dashboard/page.tsx` | เพิ่ม Alert section เหนือ bento grid |
| Modify | `apps/liff/src/pages/TaskPage.tsx` | เพิ่ม SOS bottom bar |
| Modify | `apps/liff/src/lib/api.ts` | เพิ่ม `sos()` method |

---

## Backend — AlertsService

### Dependencies

Install: `npm install @nestjs/schedule` in `apps/backend`

### Cron Job 1: Escalation Check (06:00 daily)

```typescript
@Cron('0 6 * * *')
async runEscalationCheck() {
  // 1. Query all active patients (status != MISSING)
  // 2. For each patient, find last CHECK_IN activity
  // 3. Calculate daysSinceVisit = today - lastCheckIn.createdAt
  // 4. Compare to thresholds based on patient.status
  // 5. If daysSinceVisit >= alertThreshold AND no Alert(OVERDUE) sent today → create Alert, enqueue LINE to CM
  // 6. If daysSinceVisit >= missingThreshold AND status != MISSING → update status to MISSING, create Alert(MISSING), enqueue LINE to CM
}
```

Alert dedup: ตรวจ `Alert` ที่มี `type=OVERDUE`, `patientId=X`, `resolvedAt=null`, `sentAt` วันนี้ → ไม่ส่งซ้ำ

### Cron Job 2: Caregiver Morning Briefing (07:45 daily)

```typescript
@Cron('45 7 * * *')
async sendCaregiverMorningBriefing() {
  // 1. Query all active patients with their triage + lastCheckIn
  // 2. Filter: patients ที่ (today - lastCheckIn) >= visitFrequency (due วันนี้หรือเลย)
  // 3. Group by assigned Caregiver (via latest EventTask.assigneeId)
  // 4. For each Caregiver with lineUserId → enqueue LINE message รายชื่อ
}
```

### GET /alerts

```typescript
@Get()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CASE_MANAGER, UserRole.ADMIN)
getAlerts(@CurrentUser() user: JwtPayload) {
  // Return unresolved alerts for the organization, newest first
  // Include patient name, hn, status, daysMissed, type
}
```

### POST /patients/:id/sos

```typescript
@Post(':id/sos')
@UseGuards(JwtAuthGuard)
createSos(
  @Param('id') id: string,
  @Body() dto: SosDto,          // { lat?: number; lng?: number }
  @CurrentUser() user: JwtPayload,
) {
  // 1. Verify patient exists in org
  // 2. Create Activity(SOS) + Alert(SOS, lat, lng)
  // 3. Immediately enqueue LINE to all CMs in org
  // 4. Return { ok: true }
}
```

---

## Notifications — ประเภทใหม่

เพิ่ม 3 job types ใน Bull queue `notifications`:

| Job name | Payload | Recipient |
|----------|---------|-----------|
| `send-overdue-alert` | patientName, hn, status, daysMissed, cmLineUserId | CM |
| `send-sos-alert` | patientName, hn, caregiverName, lat, lng, cmLineUserId | CM (immediate) |
| `send-morning-briefing` | patients[], caregiverLineUserId | Caregiver |

LINE message format:
- **Overdue**: "⚠️ แจ้งเตือน: เกินกำหนดเยี่ยม\nผู้ป่วย: {name} (HN {hn})\nระดับ: {status}\nเยี่ยมล่าสุด: {date}\nเกินกำหนด: {days} วัน"
- **SOS**: "🚨 SOS — เหตุฉุกเฉิน\nอาสา: {caregiver}\nผู้ป่วย: {name} (HN {hn})\n📍 {lat}, {lng}"
- **Morning**: "☀️ ผู้ป่วยที่ต้องเยี่ยมวันนี้\n" + รายชื่อ + triage + สถานที่ + deeplink LIFF

---

## Frontend — Dashboard Alert Section

เพิ่มก่อน bento grid ใน `dashboard/page.tsx`:

```tsx
// server fetch เพิ่ม:
const alerts = await fetchAlerts(token); // GET /alerts

// JSX (เหนือ bento grid):
{alerts.length > 0 && (
  <AlertSection alerts={alerts} />
)}
```

`AlertSection` เป็น server component รับ props: `alerts: Alert[]`

แต่ละ row แสดง:
- SOS: background แดงเข้ม + จุดกระพริบ (CSS animation) + ปุ่ม "ดูเร่งด่วน"
- OVERDUE CRITICAL: background `#fff8f8` + แสดงวันที่เยี่ยมล่าสุด + เกินกี่วัน
- OVERDUE PENDING/STABLE: background `#fffdf0`
- ปุ่ม "จัดการ" → link ไป `/patients/:id`

---

## LIFF — SOS Bottom Bar

ใน `apps/liff/src/pages/TaskPage.tsx` เพิ่ม fixed bottom bar:

```tsx
{/* SOS Bottom Bar — แสดงทุกหน้า */}
<div
  style={{
    position: 'fixed', bottom: 0, left: 0, right: 0,
    background: '#ff4d4f', padding: '12px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    cursor: 'pointer', zIndex: 100,
  }}
  onClick={handleSos}
>
  <span style={{ fontSize: 18 }}>🚨</span>
  <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>SOS ฉุกเฉิน</span>
</div>
```

`handleSos`:
1. ขอ `navigator.geolocation.getCurrentPosition()` (optional — ถ้า deny ก็ส่งได้โดยไม่มีตำแหน่ง)
2. แสดง confirm dialog "ยืนยันส่ง SOS?"
3. Call `api.sos(taskId, { lat, lng })`
4. แสดง success screen "ส่ง SOS แล้ว รอ CM ติดต่อกลับ"

`api.sos`:
```typescript
sos: (taskId: string, coords: { lat?: number; lng?: number }) =>
  request(`/patients/sos-by-task/${taskId}`, {
    method: 'POST',
    body: JSON.stringify(coords),
  }),
```

Backend เพิ่ม endpoint `POST /patients/sos-by-task/:taskId` (lookup patientId จาก taskId แล้ว delegate ไป createSos)

---

## Out of Scope

- Push notification ผ่านช่องทางอื่นนอกจาก LINE (email, SMS)
- Auto-resolve alerts (CM ต้อง mark resolved เองผ่าน dashboard)
- Location map view ใน dashboard (แสดงแค่ coordinates text)
- History log ของ alerts ที่ resolved แล้ว (มีใน Alert model แต่ไม่มี UI)
