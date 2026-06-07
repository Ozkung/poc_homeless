# Create Event Form — Design Spec
**Date:** 2026-06-07
**Status:** Approved
**Source:** ref/homemedconnect.html — Planning page, calOpenNew() / calSaveEvent()

---

## Overview

Add a full "สร้าง Event" form inside the Events page drawer. Currently clicking the drawer button shows `message.info('ฟีเจอร์นี้กำลังพัฒนา')`. After this spec is implemented the CM can create Events directly from the calendar by specifying the event title, date range, form templates, patients, assignee, task types, priority, and notes.

---

## UI Structure

```
Events page
└── antd Drawer (400px, right)
    ├── [View mode]  — shows event details for selected day (existing)
    └── [Create mode] — new form, triggered by "สร้าง Event" button
        ├── Section: ข้อมูล Event
        │   ├── ชื่อ Event       (antd Input)
        │   ├── วันเริ่ม / สิ้นสุด (antd DatePicker.RangePicker)
        │   ├── Form Templates   (antd Select mode="multiple", loads from /forms)
        │   ├── ผู้ป่วย          (antd Select mode="multiple", loads from /patients)
        │   └── ความเร่งด่วน     (antd Select: ปกติ / เร่งด่วน / วิกฤต)
        ├── Section: มอบหมายงาน
        │   ├── มอบหมายให้       (antd Select, loads from /users)
        │   └── หมายเหตุ         (antd Input.TextArea, 3 rows)
        └── Footer
            ├── [บันทึก Event]   (antd Button type="primary")
            └── [ยกเลิก]         (antd Button)
```

---

## State Design

```tsx
// EventsPage state additions
const [drawerMode, setDrawerMode] = useState<'view' | 'create'>('view');
const [createForm] = Form.useForm();
const [users, setUsers]   = useState<User[]>([]);
const [forms, setForms]   = useState<FormTemplate[]>([]);
```

On mount: fetch `/patients` (already fetched), `/forms`, `/users` in parallel.

---

## Behaviour

| Action | Result |
|---|---|
| Click "+ สร้าง Event" (page header) | Drawer opens in create mode, form blank |
| Click date on calendar → click "+ เพิ่มกิจกรรม" | Drawer opens in create mode, วันเริ่ม pre-filled |
| Submit with empty title | antd Form validation — "กรุณาใส่ชื่อ Event" |
| Submit success (POST /events) | Drawer closes, calendar refetches current month, antd message.success |
| Submit fail | antd message.error |

---

## API Contract

`POST /events` — already exists in backend

```ts
// Request body
{
  title: string;          // required
  startDate: string;      // ISO date
  endDate: string;        // ISO date
  priority: 'NORMAL' | 'URGENT' | 'CRITICAL';
  note?: string;
  // Tasks are auto-generated: one EventTask per patient × assignee
  patientIds: string[];
  assigneeId: string;
  formTemplateId?: string; // optional — one form per event for now
}
```

The existing backend creates EventTasks automatically from `patientIds × assigneeId`.

---

## Files to Change

| File | Change |
|---|---|
| `app/(app)/events/page.tsx` | Add drawer mode state, create form, fetch users/forms, POST handler |
| No backend changes needed | `/events POST` already implemented |

---

## What Does NOT Change

- Calendar grid rendering
- Drawer view-mode (event details on day click)
- Priority dot colors
