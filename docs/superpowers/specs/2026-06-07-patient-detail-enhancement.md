# Patient Detail Enhancement — Design Spec
**Date:** 2026-06-07
**Status:** Approved
**Source:** ref/homemedconnect.html — Patients page, detail view with 4 tabs

---

## Overview

Enhance the patient profile page (`/patients/[id]`) from its current 3-card layout (demographics + activities + submissions) to match the ref: a **4-tab layout** with Hero Stats, richer info tables, filterable Timeline, expandable Form History, and a Care Plan checklist.

---

## Tab Structure

```
Patient Profile page
├── Header (name, breadcrumb, status tag) — unchanged
└── antd Tabs
    ├── Tab 1: ข้อมูล      — hero stats + personal/health tables + CM card
    ├── Tab 2: Timeline    — activity list with type filter
    ├── Tab 3: Form History — submissions as expandable sessions
    └── Tab 4: Care Plan   — checklist with priority + frequency
```

---

## Tab 1 — ข้อมูล

### Hero Stats Row (4 mini-cards)
| Stat | Source |
|---|---|
| Visit ทั้งหมด | `activities.filter(type === 'CHECK_IN').length` |
| อัตรารับยา (%) | computed from submissions with drug-related form answers — display `—` if no data |
| วันที่ขาดนัด | count activities with payload.status === 'NOT_FOUND' |
| Form เดือนนี้ | submissions in current month |

### Personal Info Table
Fields: ชื่อ-นามสกุล, อายุ, เพศ, HN, พื้นที่พักประจำ, สถานะ

### Health Info Table  
Fields: โรคประจำตัว (conditions array as tags), สถานะปัจจุบัน

### CM Card
CM name + avatar initials from `patient.caseManager` (already in API response).

---

## Tab 2 — Timeline

Filter dropdown (antd Select): ทุก Activity / Check-in / Form Submit / Note / Assign

Display: antd `Timeline` component — same as current, but with filter applied client-side.  
Each item shows: actor name, activity type tag, date, payload.note if present.

---

## Tab 3 — Form History

Group submissions by `formTemplate.title`. Each group is an expandable antd `Collapse` panel:

```
Panel header: [date] [form title] [submittedBy] [status badge]
Panel body:   field answers rendered as label → value pairs
              answers: [{fieldId, value}] — map fieldId → FormTemplate.fields[].label
```

Answers are already in `submissions[].answers` (JSONB). To render labels, cross-reference against the form template's fields array (already returned by `/patients/:id/submissions` enriched response — if not, fetch `/forms/:id` once per unique formTemplateId).

---

## Tab 4 — Care Plan

### Data Model (new backend resource)

```
CarePlanItem {
  id:          UUID
  patientId:   UUID → patients
  title:       string       // "รับ Metformin 500mg หลังอาหาร"
  frequency:   string       // "ทุกวัน" / "สัปดาห์ละ 1 ครั้ง" / etc.
  priority:    'HIGH' | 'MED' | 'LOW'
  assigneeName?: string
  isDone:      boolean      // togglable by CM
  createdAt:   DateTime
}
```

### New API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/patients/:id/care-plan` | JWT CM | List care plan items for patient |
| POST | `/patients/:id/care-plan` | JWT CM | Add item |
| PATCH | `/patients/:id/care-plan/:itemId` | JWT CM | Update (isDone, title, etc.) |
| DELETE | `/patients/:id/care-plan/:itemId` | JWT CM | Remove item |

### UI

- antd List of care items: checkbox (isDone) + title + frequency + priority badge + delete button
- "+ เพิ่มแผน" button → antd Modal with form: title, frequency (Select), priority (Select), assigneeName (Input optional)
- Priority badge colors: HIGH → red, MED → orange, LOW → green (antd Tag)
- isDone toggle: PATCH immediately on click, optimistic update

---

## Files to Change

| File | Change |
|---|---|
| `app/(app)/patients/[id]/page.tsx` | Convert to 4-tab layout, add hero stats, render Form History |
| `app/(app)/patients/[id]/care-plan-tab.tsx` | New client component for Care Plan tab |
| `apps/backend/src/modules/patients/patients.controller.ts` | Add care-plan endpoints |
| `apps/backend/src/modules/patients/patients.service.ts` | Add care-plan CRUD methods |
| `apps/backend/prisma/schema.prisma` | Add `CarePlanItem` model |
| `apps/backend/prisma/migrations/` | New migration |

---

## What Does NOT Change

- Patient list page (`/patients`)
- `GET /patients/:id` response shape
- Activities + Submissions APIs
