# LIFF ReportPage — Event-based Patient Visit Design Spec

**Date:** 2026-07-05  
**Status:** Approved

---

## Overview

ปรับ LIFF ReportPage จาก "หน้าเพิ่มผู้ป่วย" เป็น "หน้าลงตรวจประจำวัน" — แสดงผู้ป่วยที่อยู่ใน Event วันนี้ ตาม zone ของ LIFF user พร้อม bottom sheet 2 tabs สำหรับกรอกแบบสำรวจและบันทึก Note รวมถึงสร้าง seed data 4 Events วันนี้ครอบคลุมทุก zone

---

## User Flow

```
[ReportPage] fetch GET /events/today/my-tasks (zone = preferredZoneId)
     ↓ แสดง patient list พร้อม task status
[กด patient card] → เปิด Bottom Sheet
     ↓
[Tab: แบบสำรวจ] กรอก form fields จาก formTemplate
     ├─ กด "Check-in" → POST /tasks/:id/check-in → Activity(CHECK_IN)
     └─ กด "ส่งแบบสำรวจ" → POST /tasks/:id/submit → Submission + Activity(FORM_SUBMIT)
[Tab: Note] กรอก textarea
     └─ กด "บันทึก" → POST /tasks/:id/note → Activity(NOTE) (กดได้หลายครั้ง)
[ปุ่ม "+"] → navigate ไป /add (AddPage)
```

ทุก Activity อัพเดท Timeline ผู้ป่วยใน admin frontend อัตโนมัติ

---

## Architecture

### Backend — 4 Endpoints ใหม่

สร้าง `EventsController` endpoint + method ใหม่ใน `TasksController` / `TasksService`

**1. `GET /events/today/my-tasks`**
- Guard: `JwtAuthGuard` + role `GUEST`
- Logic: หา Events ที่ `startDate ≤ now ≤ endDate` และ `organizationId = user.orgId`
  → ดึง EventTasks ที่ `patient.zoneId = user.preferredZoneId`
- Response:
```json
[{
  "taskId": "...",
  "eventId": "...",
  "eventTitle": "ลงตรวจ เขตพระนคร",
  "status": "PENDING",
  "patient": { "id": "...", "hn": "...", "name": "...", "age": 54, "status": "CRITICAL", "conditions": [] },
  "formTemplate": { "id": "...", "title": "แบบประเมินสุขภาพเบื้องต้น", "fields": [...] }
}]
```

**2. `POST /tasks/:taskId/check-in`**
- Guard: `JwtAuthGuard` + role `GUEST`
- Body: `{ note?: string }`
- Logic: สร้าง Activity(type=CHECK_IN), update EventTask.status = IN_PROGRESS ถ้าเป็น PENDING
- Response: `{ activityId: string }`

**3. `POST /tasks/:taskId/submit`**
- Guard: `JwtAuthGuard` + role `GUEST`
- Body: `{ answers: [{ fieldId: string, value: string }] }`
- Logic: validate required fields → สร้าง Submission + Activity(type=FORM_SUBMIT)
- Response: `{ submissionId: string }`

**4. `POST /tasks/:taskId/note`**
- Guard: `JwtAuthGuard` + role `GUEST`
- Body: `{ note: string }`
- Logic: สร้าง Activity(type=NOTE, payload.note)
- Response: `{ activityId: string }`

ทุก endpoint ต้องตรวจว่า task อยู่ใน org เดียวกับ user ก่อน (ป้องกัน cross-org access)

### LIFF Pages

**Routing (แก้ `main.tsx`):**
```
/       → HomePage (ไม่เปลี่ยน)
/report → ReportPage (redesign)
/add    → AddPage (= ReportPage เดิม)
/profile → ProfilePage (ไม่เปลี่ยน)
```

**ReportPage (redesign ทั้งหมด):**
- State: `loading | no-event | empty | list`
  - `no-event`: ไม่มี Event วันนี้ใน zone → แสดงข้อความ "ไม่มีการลงตรวจในพื้นที่ของคุณวันนี้"
  - `empty`: มี Event แต่ไม่มี patient task → "ยังไม่มีผู้ป่วยในรายการ"
  - `list`: แสดง patient cards
- Patient card แสดง: ชื่อ, HN, status badge (CRITICAL/PENDING/STABLE/MISSING), task status chip
- ปุ่ม "+" (FAB มุมขวาล่าง) → navigate `/add`
- กด card → setSelectedTask → เปิด Bottom Sheet

**PatientTaskSheet (Bottom Sheet component):**
- Slide-up animation, backdrop กด close ได้
- Header: ชื่อ + HN + status badge
- Tab 1 "แบบสำรวจ":
  - Render fields ตาม type: `number | text | textarea | radio | select | scale`
  - ปุ่ม "Check-in" (เสมอ active) — แสดง spinner ขณะ POST
  - ปุ่ม "ส่งแบบสำรวจ" (active เมื่อ required fields ครบ) — disable หลัง submit สำเร็จ
  - แสดง success message เมื่อ submit แล้ว
- Tab 2 "Note":
  - `<textarea>` + ปุ่ม "บันทึก"
  - แสดง notes ที่บันทึกไว้แล้วในวันนี้ (list ด้านล่าง)
  - ล้าง textarea หลัง submit สำเร็จ (ให้กดได้เรื่อยๆ)

**AddPage (ใหม่ — = ReportPage เดิม):**
- Copy ReportPage เดิมทั้งหมดมาเป็น AddPage
- แก้ back button navigate กลับ `/report`
- Success screen navigate กลับ `/report` แทน `/`

**api.ts เพิ่ม 4 methods:**
```typescript
getTodayTasks(): Promise<TaskSummary[]>
checkIn(taskId: string, note?: string): Promise<{ activityId: string }>
submitForm(taskId: string, answers: Answer[]): Promise<{ submissionId: string }>
addNote(taskId: string, note: string): Promise<{ activityId: string }>
```

### Seed Data (เพิ่มใน seed.ts)

**4 Events วันนี้** (startDate = today 08:00, endDate = today 20:00, priority = URGENT):

| id | title | zone | patients |
|---|---|---|---|
| evt-today-001 | ลงตรวจ เขตพระนคร | zone-seed-001 | pat-001, pat-003, pat-007 |
| evt-today-002 | ลงตรวจ เขตป้อมปราบฯ | zone-seed-002 | pat-002, pat-008 |
| evt-today-003 | ลงตรวจ เขตหนองจอก | zone-seed-003 | pat-004, pat-006 |
| evt-today-004 | ลงตรวจ เขตสัมพันธวงศ์ | zone-seed-004 | pat-005 |

**EventTasks:** 1 task ต่อผู้ป่วย, formTemplate = form-seed-001 (แบบประเมินสุขภาพเบื้องต้น)

**Submissions (simulate บางส่วนกรอกแล้ว):**
- pat-001, pat-003, pat-007 → มี Submission แล้ว (submittedBy = guest1/guest2), task status = DONE
- pat-002, pat-004, pat-005, pat-006, pat-008 → status = PENDING (ทดสอบกรอกได้)

**ผู้ป่วยใหม่ผ่าน LIFF:**
- `pat-seed-liff-001`: นายทดสอบ ลงพื้นที่, age=35, PENDING, zone-seed-001
  - สร้างโดย guest1 (reportedById = user-seed-guest1)

---

## Error Handling

| สถานการณ์ | การจัดการ |
|---|---|
| ไม่มี preferredZoneId | แสดง "กรุณาตั้งค่า Zone ก่อนใช้งาน" + link ไป /profile |
| ไม่มี Event วันนี้ | แสดง "ไม่มีการลงตรวจวันนี้" |
| Check-in ซ้ำ | backend ไม่บล็อก — สร้าง Activity ได้เรื่อยๆ |
| Submit form ซ้ำ | ปุ่ม disable หลัง submit สำเร็จครั้งแรก |
| Network error | แสดง error toast + ปุ่ม retry |

---

## Files to Change / Create

| File | Action |
|---|---|
| `apps/backend/src/modules/events/events.controller.ts` | เพิ่ม `GET /events/today/my-tasks` |
| `apps/backend/src/modules/events/events.service.ts` | เพิ่ม `getTodayTasks()` |
| `apps/backend/src/modules/tasks/tasks.controller.ts` | เพิ่ม check-in, submit, note endpoints |
| `apps/backend/src/modules/tasks/tasks.service.ts` | เพิ่ม `checkIn()`, `submitForm()`, `addNote()` |
| `apps/backend/src/modules/tasks/dto/submit-task.dto.ts` | เพิ่ม SubmitFormDto |
| `apps/liff/src/main.tsx` | เพิ่ม route `/add` |
| `apps/liff/src/pages/ReportPage.tsx` | Redesign ทั้งหมด |
| `apps/liff/src/pages/AddPage.tsx` | สร้างใหม่ (= ReportPage เดิม) |
| `apps/liff/src/components/PatientTaskSheet.tsx` | สร้างใหม่ (bottom sheet) |
| `apps/liff/src/lib/api.ts` | เพิ่ม 4 methods |
| `apps/backend/prisma/seed.ts` | เพิ่ม today's Events + Tasks + Submissions |
