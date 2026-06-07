# Reports Page — Design Spec
**Date:** 2026-06-07
**Status:** Approved
**Source:** ref/homemedconnect.html — Reports page

---

## Overview

Add a new `/reports` page to the CM Dashboard showing monthly KPI summaries, progress bars, and a per-patient stats table. This is a read-only analytics view — no data mutation.

---

## Route & Navigation

- Path: `/reports`
- Sidebar: เพิ่ม nav item "รายงาน" (Lucide icon: `BarChart3`) between forms and logout
- Server component with `export const dynamic = 'force-dynamic'`

---

## Page Layout

```
/reports
├── Page header: "รายงานและสถิติ"  +  [📥 ส่งออก PDF] button (placeholder)
├── Month selector row             (antd DatePicker.MonthPicker, default = current month)
├── KPI Cards Row (3 cards)
│   ├── Follow-up Rate
│   ├── อัตรารับยาต่อเนื่อง
│   └── งาน Assigned เสร็จ
└── Per-patient Summary Table
```

---

## KPI Cards

Each card: big number (antd `Statistic`) + antd `Progress` bar + subtitle.

| KPI | Calculation | Target |
|---|---|---|
| Follow-up Rate | `(tasks DONE + NOT_FOUND) / total tasks` × 100 | 80% |
| อัตรารับยา | `submissions count / expected visits` × 100 | 75% |
| งาน Assigned เสร็จ | `tasks where status = 'DONE' / total tasks` × 100 | — |

Progress bar color: green if ≥ target, orange if within 10% below, red if > 10% below.

---

## Per-patient Summary Table

antd `Table` with columns:

| Column | Source |
|---|---|
| ผู้ป่วย | patient.name |
| โรคประจำตัว | patient.conditions (tags) |
| รับยาต่อเนื่อง | % from submissions this month |
| Follow-up | `done_tasks / total_tasks` formatted as "X/Y ครั้ง" |
| ER เดือนนี้ | activities with type STATUS_CHANGE + payload.note containing "ER" or "โรงพยาบาล" (best-effort, show 0 if none) |
| สถานะ | antd Tag (color from status) |

Sortable columns: Follow-up, รับยาต่อเนื่อง, สถานะ.

---

## New Backend Endpoint

`GET /reports/monthly?month=6&year=2026`

Response:

```ts
{
  followUpRate: number;        // 0–100
  medicationRate: number;      // 0–100
  completionRate: number;      // 0–100
  totalTasks: number;
  completedTasks: number;
  patients: {
    id: string;
    name: string;
    conditions: string[];
    status: 'CRITICAL' | 'PENDING' | 'STABLE';
    followUpDone: number;
    followUpTotal: number;
    submissionCount: number;
    expectedVisits: number;
  }[];
}
```

**New NestJS module:** `reports/` with `ReportsController` + `ReportsService`.

---

## Export PDF

Button renders as disabled with `message.info('ฟีเจอร์กำลังพัฒนา')` — placeholder only, no implementation.

---

## Files to Change

| File | Change |
|---|---|
| `app/(app)/reports/page.tsx` | New server component page |
| `components/layout/Sidebar.tsx` | Add reports nav item |
| `apps/backend/src/modules/reports/` | New module: controller + service |
| `apps/backend/src/app.module.ts` | Register ReportsModule |

---

## What Does NOT Change

- Existing patient/events/forms data models
- Any mutation endpoints
