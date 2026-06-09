# Role-Based Dashboards & Access Control — Design Spec

**Date:** 2026-06-09  
**Status:** Approved

---

## Overview

ปรับระบบ HomeMed Connect ให้แต่ละ Role มี Dashboard และ Permission ที่ชัดเจน โดย login เดียวกัน แต่ redirect ไปยัง path แยกต่างหากตาม Role หลัง authenticate สำเร็จ

---

## Decisions

| Topic | Decision |
|-------|----------|
| Navigation | Separate path per role (`/admin`, `/cm`, `/fw`, `/medvol`) |
| Route structure | Next.js Route Groups + Shared Components (Hybrid) |
| FIELD_WORKER platform | LIFF (รับ Task) + Web Dashboard (ดู stats) |
| Cluster/Zone | Admin-defined Zone model — ไม่ใช่ free-text grouping |
| MEDICAL_VOLUNTEER inventory | Full CRUD (เพิ่ม/ลด stock, อนุมัติ request ของตัวเอง) |
| Success Rate | Task completion % + Patient status improved (แสดงแยก metric) |

---

## Roles

### SUPER_ADMIN — `/admin/*`

**สิทธิ์:** ภาพรวมทั้งหมด, จัดการ Zone, จัดการ Users, โยกย้าย FIELD_WORKER ระหว่าง CASE_MANAGER

**Dashboard (`/admin/dashboard`):**
- DateRange picker filter (global — ทุก metric ใช้ range เดียวกัน)
- **Tab: Overview** — KPI (ผู้ป่วยทั้งหมด, CRITICAL count, Task completion %, Active CM/FW), bar chart ผู้ป่วยตาม Zone, Patient status distribution chart, FW Transfer panel
- **Tab: Cluster** — Zone cards แสดง FW/CM ที่รับผิดชอบ + success rate ต่อ Zone
- **Tab: Inventory** — stock overview ทุก item + pending requests

**FW Transfer flow:** เลือก CM ต้นทาง → เลือก FIELD_WORKER → เลือก CM ปลายทาง → confirm — อัปเดต `supervisorId` ใน DB

**Pages:**
- `/admin/dashboard`
- `/admin/zones` — CRUD Zone (ชื่อ, คำอธิบาย, สี)
- `/admin/users` — จัดการ Users ทุก Role + FW Transfer
- `/admin/patients/[id]` — shared PatientDetailView (read-only)

---

### CASE_MANAGER — `/cm/*`

**สิทธิ์:** จัดการผู้ป่วย, สร้าง Form, สร้าง Event + assign FW ภายใต้ตัวเอง, Create User (FIELD_WORKER เท่านั้น — `supervisorId` = ตัวเอง), ทำงานเหมือน FIELD_WORKER ได้

**Dashboard (`/cm/dashboard`):**
- KPI: ผู้ป่วยในมือ, จำนวน FW ภายใต้, Task Success %, Status Improved count
- Zone cards: แต่ละ Zone แสดง FW ที่รับผิดชอบ + success rate (เฉพาะ Zone ที่มีผู้ป่วยของตน)
- Cumulative Success Rate chart: 6 เดือนย้อนหลัง (Task ✓ + Status Improved รวม)
- Recent Action Table: activity ของ FW ในทีม (เวลา, FW, HN, Action, Status)

**Pages:**
- `/cm/dashboard`
- `/cm/patients` · `/cm/patients/new` · `/cm/patients/[id]`
- `/cm/forms` · `/cm/forms/new` · `/cm/forms/[id]` · `/cm/forms/[id]/builder`
- `/cm/events`
- `/cm/users` — Create FIELD_WORKER (ภายใต้ตัวเอง)

---

### FIELD_WORKER — `/fw/*`

**สิทธิ์:** เห็นเฉพาะผู้ป่วยที่ถูก Assign, ไม่สร้าง Form, ไม่เห็น Inventory, ทำงานภายใต้ CASE_MANAGER คนเดียว

**Dashboard (`/fw/dashboard`):**
- KPI: ผู้ป่วยของฉัน, งานวันนี้ (pending count), กินยาครบ (x/total), Task success %
- สถานะยา: list ผู้ป่วยแต่ละคน — กินครบ / ยังไม่รายงาน (จาก Form submission)
- ช่วงอายุผู้ป่วย: bar chart (18-30, 31-45, 46-60, 60+)
- Case ที่รับบ่อย: horizontal bar (conditions จาก Patient.conditions[])
- งานวันนี้: task list พร้อม status badge

**Platform:** Web Dashboard + LINE LIFF (รับ Task notification และกรอก Form)

**Pages:**
- `/fw/dashboard`
- `/fw/patients` — เฉพาะ Patient ที่ถูก assign ผ่าน EventTask
- `/fw/patients/[id]` — shared PatientDetailView (readonly)
- `/fw/tasks` — Task list ของตัวเอง

---

### MEDICAL_VOLUNTEER — `/medvol/*`

**สิทธิ์:** จัดการ Inventory เต็มรูปแบบ (CRUD stock, อนุมัติ/ปฏิเสธ request), ดูผู้ป่วยทุกคน (read-only)

**Dashboard (`/medvol/dashboard`):**
- KPI: รายการสินค้า (ชนิด), stock ใกล้หมด (แดง), request รออนุมัติ, ผู้ป่วยทั้งหมด
- Stock Level list: แต่ละ item มี progress bar สี (เขียว ≥70%, เหลือง 30-69%, แดง <30%) + ปุ่มเพิ่มสินค้า
- Patient Status Overview: STABLE / PENDING / CRITICAL count cards
- Request อนุมัติ inline: อนุมัติ / ปฏิเสธได้จาก dashboard

**Pages:**
- `/medvol/dashboard`
- `/medvol/inventory` — Full CRUD (เพิ่ม item, ปรับ stock, จัดการ request)
- `/medvol/patients` — ดูผู้ป่วยทั้งหมด (read-only)
- `/medvol/patients/[id]` — shared PatientDetailView (read-only)

---

## Architecture

### Route Structure

```
app/
  (auth)/
    login/page.tsx
    setup/page.tsx
  (admin)/
    layout.tsx          ← AdminLayout (sidebar: Dashboard, Zones, Users)
    dashboard/page.tsx
    zones/page.tsx
    users/page.tsx
    patients/[id]/page.tsx
  (cm)/
    layout.tsx          ← CMLayout (sidebar: Dashboard, Patients, Forms, Events, My Team)
    dashboard/page.tsx
    patients/...
    forms/...
    events/page.tsx
    users/page.tsx
  (fw)/
    layout.tsx          ← FWLayout (sidebar: Dashboard, ผู้ป่วยของฉัน, งานของฉัน)
    dashboard/page.tsx
    patients/...
    tasks/page.tsx
  (medvol)/
    layout.tsx          ← MedVolLayout (sidebar: Dashboard, Inventory, ผู้ป่วย)
    dashboard/page.tsx
    inventory/page.tsx
    patients/...
```

### Shared Components

```
components/
  patients/
    PatientDetailView.tsx   ← props: { readonly?: boolean, role: UserRole }
  inventory/
    StockLevelBar.tsx
    RequestApprovalRow.tsx
  dashboard/
    KpiCard.tsx
    BarChart.tsx
    RecentActionTable.tsx
    ZoneCard.tsx
```

### Middleware

`middleware.ts` — หลัง NextAuth authenticate:
- `SUPER_ADMIN` → redirect `/admin/dashboard`
- `CASE_MANAGER` → redirect `/cm/dashboard`
- `FIELD_WORKER` → redirect `/fw/dashboard`
- `MEDICAL_VOLUNTEER` → redirect `/medvol/dashboard`
- Guard: แต่ละ route group reject request ที่ role ไม่ตรง → redirect กลับ dashboard ของ role ตัวเอง

---

## Database Changes

### New Model: Zone

```prisma
model Zone {
  id             String    @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  name           String
  description    String?
  color          String?   // hex color for UI
  createdAt      DateTime  @default(now())
  patients       Patient[]
}
```

### Patch: Patient

```prisma
model Patient {
  // ... existing fields
  zoneId  String?
  zone    Zone?   @relation(fields: [zoneId], references: [id])
}
```

### Patch: User

```prisma
model User {
  // ... existing fields
  supervisorId   String?
  supervisor     User?   @relation("Supervisor", fields: [supervisorId], references: [id])
  subordinates   User[]  @relation("Supervisor")
}
```

---

## Backend API Changes

### New Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET/POST/PATCH/DELETE | `/zones` | ADMIN, SUPER_ADMIN | CRUD Zone |
| GET | `/dashboard/admin` | SUPER_ADMIN | Overview stats + Zone breakdown |
| GET | `/dashboard/cm` | CASE_MANAGER | CM stats + zone cards + recent actions |
| GET | `/dashboard/fw` | FIELD_WORKER | FW personal stats |
| GET | `/dashboard/medvol` | MEDICAL_VOLUNTEER | Inventory + patient summary |
| PATCH | `/users/:id/supervisor` | SUPER_ADMIN | โยกย้าย FW ระหว่าง CM |
| POST | `/users` (scoped) | CASE_MANAGER | Create FIELD_WORKER (supervisorId = self) |

### Existing Endpoints — Scope Changes

- `GET /patients` — FIELD_WORKER: filter เฉพาะ patient ที่ assign ผ่าน EventTask
- `POST /users` — CASE_MANAGER: force `role=FIELD_WORKER`, `supervisorId=self`

---

## Success Rate Definition

- **Task Success %** = Tasks ที่ `status=DONE` / Tasks ทั้งหมด ในช่วง DateRange
- **Status Improved** = count ของ Patient ที่ `status` เปลี่ยนจาก `CRITICAL` หรือ `PENDING` → `STABLE` ในช่วง DateRange (ดูจาก Activity log)

---

## Medication Adherence (กินยาครบ)

ดึงจาก Form Submission ที่มี field ประเภท "medication_check" ใน FormTemplate — ถ้า Patient มี submission ล่าสุดที่ตอบว่า "กินครบ" ใน 24 ชั่วโมง = กินครบ, อื่นๆ = ยังไม่รายงาน

---

## ADMIN Role Clarification

Schema มี `ADMIN` role อยู่แล้ว (แยกจาก `SUPER_ADMIN`) — ในการ implement นี้:
- `ADMIN` → redirect ไป `/admin/*` เหมือน `SUPER_ADMIN` (share layout เดียวกัน)
- ความแตกต่าง: `ADMIN` ไม่เห็น Users management และไม่สามารถโยกย้าย FIELD_WORKER ได้ (feature เหล่านั้น guard ด้วย `SUPER_ADMIN` เท่านั้น)
- Middleware แยก `SUPER_ADMIN` vs `ADMIN` ใน guard ระดับ page ไม่ใช่ระดับ layout

---

## Out of Scope

- Real-time notifications (ใช้ polling หรือ LINE push เหมือนเดิม)
- Map view สำหรับ Zone (แสดงเป็น card list ก่อน)
- การปรับ ADMIN role permissions นอกเหนือจาก routing (คงเดิมตาม controller guards ที่มีอยู่)
