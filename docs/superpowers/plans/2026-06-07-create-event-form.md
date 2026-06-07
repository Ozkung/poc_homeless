# Create Event Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full "สร้าง Event" create-form inside the Events page drawer so CMs can create events with patients, form templates, assignee, priority and notes directly from the calendar.

**Architecture:** Extend `events/page.tsx` with a `drawerMode` state (`'view' | 'create'`). Create mode renders an antd Form inside the existing Drawer. On submit, POST to `/events`. After success, refetch the current month's events and show the new event on the calendar. All data needed (patients, forms, users) is fetched in parallel on mount.

**Tech Stack:** Next.js 16 App Router, React `'use client'`, antd Form/DatePicker/Select/Input, existing `/events` POST endpoint.

---

## File Map

| Action | File |
|---|---|
| Modify | `apps/frontend/src/app/(app)/events/page.tsx` |

---

### Task 1: Add state and parallel data fetching

**Files:**
- Modify: `apps/frontend/src/app/(app)/events/page.tsx`

- [ ] **Step 1: Add imports and new state at top of `EventsPage`**

Open `apps/frontend/src/app/(app)/events/page.tsx`. Add these imports after the existing ones:

```tsx
import { Form, Select, DatePicker } from 'antd';
import dayjs from 'dayjs';
```

Add inside `EventsPage` (after existing useState declarations):

```tsx
const [drawerMode, setDrawerMode] = useState<'view' | 'create'>('view');
const [createForm] = Form.useForm();
const [users, setUsers]   = useState<{ id: string; displayName: string }[]>([]);
const [formTemplates, setFormTemplates] = useState<{ id: string; title: string }[]>([]);
const [saving, setSaving] = useState(false);
```

- [ ] **Step 2: Fetch users and form templates on mount**

Replace the existing `useEffect` that fetches events with this expanded version (keep event fetching, add parallel fetches):

```tsx
// Fetch users + form templates once on mount
useEffect(() => {
  if (!session?.accessToken) return;
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  Promise.all([
    fetch(`${API_URL}/users`, { headers }).then((r) => r.ok ? r.json() : []),
    fetch(`${API_URL}/forms`, { headers }).then((r) => r.ok ? r.json() : []),
  ]).then(([u, f]) => {
    setUsers(Array.isArray(u) ? u : []);
    setFormTemplates(Array.isArray(f) ? f : []);
  }).catch(() => {});
}, [session?.accessToken]);
```

Keep the existing month-based events fetch useEffect untouched.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/\(app\)/events/page.tsx
git commit -m "feat(events): fetch users + form templates for event creation"
```

---

### Task 2: Add create-event handler

**Files:**
- Modify: `apps/frontend/src/app/(app)/events/page.tsx`

- [ ] **Step 1: Add `handleCreateEvent` function**

Add this function inside `EventsPage`, before the return statement:

```tsx
async function handleCreateEvent(values: {
  title: string;
  dateRange: [dayjs.Dayjs, dayjs.Dayjs];
  priority: 'NORMAL' | 'URGENT' | 'CRITICAL';
  patientIds: string[];
  assigneeId: string;
  formTemplateId?: string;
  note?: string;
}) {
  setSaving(true);
  try {
    const res = await fetch(`${API_URL}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.accessToken}`,
      },
      body: JSON.stringify({
        title: values.title,
        startDate: values.dateRange[0].toISOString(),
        endDate: values.dateRange[1].toISOString(),
        priority: values.priority,
        patientIds: values.patientIds,
        assigneeId: values.assigneeId,
        formTemplateId: values.formTemplateId,
        note: values.note,
      }),
    });
    if (res.ok) {
      message.success('สร้าง Event เรียบร้อย');
      createForm.resetFields();
      setDrawerMode('view');
      setSelectedDate(null);
      // Refetch current month
      setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth(), 1));
    } else {
      message.error('บันทึกไม่สำเร็จ กรุณาลองใหม่');
    }
  } catch {
    message.error('เกิดข้อผิดพลาด กรุณาลองใหม่');
  } finally {
    setSaving(false);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/app/\(app\)/events/page.tsx
git commit -m "feat(events): add create-event POST handler"
```

---

### Task 3: Build the create-event form JSX

**Files:**
- Modify: `apps/frontend/src/app/(app)/events/page.tsx`

- [ ] **Step 1: Add `CreateEventForm` component above `EventsPage`**

Add this component (uses props for data, so it stays pure):

```tsx
function CreateEventForm({
  patients,
  users,
  formTemplates,
  saving,
  form,
  onFinish,
  onCancel,
}: {
  patients: { id: string; name: string; status: string }[];
  users: { id: string; displayName: string }[];
  formTemplates: { id: string; title: string }[];
  saving: boolean;
  form: ReturnType<typeof Form.useForm>[0];
  onFinish: (v: any) => void;
  onCancel: () => void;
}) {
  return (
    <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ priority: 'NORMAL' }}>
      <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f5f5f5' }}>
        ข้อมูล Event
      </div>

      <Form.Item name="title" label="ชื่อ Event" rules={[{ required: true, message: 'กรุณาใส่ชื่อ Event' }]}>
        <Input placeholder="เช่น Follow-up รายสัปดาห์" />
      </Form.Item>

      <Form.Item name="dateRange" label="วันเริ่ม – สิ้นสุด" rules={[{ required: true, message: 'กรุณาเลือกวันที่' }]}>
        <DatePicker.RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
      </Form.Item>

      <Form.Item name="priority" label="ความเร่งด่วน">
        <Select options={[
          { value: 'NORMAL',   label: '📅 ปกติ' },
          { value: 'URGENT',   label: '⚠️ เร่งด่วน' },
          { value: 'CRITICAL', label: '🚨 วิกฤต' },
        ]} />
      </Form.Item>

      <Form.Item name="patientIds" label="ผู้ป่วย" rules={[{ required: true, message: 'เลือกผู้ป่วยอย่างน้อย 1 คน' }]}>
        <Select
          mode="multiple"
          placeholder="เลือกผู้ป่วย..."
          options={patients.map((p) => ({ value: p.id, label: p.name }))}
          filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
        />
      </Form.Item>

      <Form.Item name="formTemplateId" label="Form Template">
        <Select
          allowClear
          placeholder="เลือก Form (ถ้ามี)..."
          options={formTemplates.map((f) => ({ value: f.id, label: f.title }))}
        />
      </Form.Item>

      <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, margin: '12px 0 12px', paddingBottom: 8, borderBottom: '1px solid #f5f5f5' }}>
        มอบหมายงาน
      </div>

      <Form.Item name="assigneeId" label="มอบหมายให้" rules={[{ required: true, message: 'เลือกผู้รับผิดชอบ' }]}>
        <Select
          placeholder="เลือกผู้ช่วย CM..."
          options={users.map((u) => ({ value: u.id, label: u.displayName }))}
        />
      </Form.Item>

      <Form.Item name="note" label="หมายเหตุ">
        <Input.TextArea rows={3} placeholder="คำแนะนำพิเศษถึงผู้ช่วย CM..." />
      </Form.Item>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="primary" htmlType="submit" loading={saving} block>💾 บันทึก Event</Button>
        <Button onClick={onCancel}>ยกเลิก</Button>
      </div>
    </Form>
  );
}
```

- [ ] **Step 2: Wire the Drawer to support both modes**

In the existing `<Drawer>` JSX, update:

1. Change the `extra` button to open create mode:
```tsx
extra={
  <Button type="primary" size="small" onClick={() => {
    createForm.resetFields();
    setDrawerMode('create');
  }}>
    + สร้าง Event
  </Button>
}
```

2. Change `open` to also open when `drawerMode === 'create'`:
```tsx
open={selectedDate !== null || drawerMode === 'create'}
onClose={() => { setSelectedDate(null); setDrawerMode('view'); createForm.resetFields(); }}
```

3. Add conditional render inside Drawer body (after the existing event list rendering):
```tsx
{drawerMode === 'create' && (
  <CreateEventForm
    patients={/* pass a simplified list */
      [] /* derive from events data or fetch separately */
    }
    users={users}
    formTemplates={formTemplates}
    saving={saving}
    form={createForm}
    onFinish={handleCreateEvent}
    onCancel={() => { setDrawerMode('view'); createForm.resetFields(); }}
  />
)}
{drawerMode === 'view' && (
  /* existing event list JSX goes here */
)}
```

- [ ] **Step 3: Pass patients to the form**

The page already fetches patients via `session?.accessToken` in a useEffect (from `NEXT_PUBLIC_API_URL/patients`). Reuse that state. The `patients` state already exists in `EventsPage` — verify it exists; if not add:

```tsx
const [allPatients, setAllPatients] = useState<{ id: string; name: string; status: string }[]>([]);

// inside the mount useEffect, add:
fetch(`${API_URL}/patients`, { headers }).then((r) => r.ok ? r.json() : []).then((p) => {
  setAllPatients(Array.isArray(p) ? p : []);
}).catch(() => {});
```

Pass `allPatients` to `<CreateEventForm patients={allPatients} ... />`.

- [ ] **Step 4: TypeScript check**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/app/\(app\)/events/page.tsx
git commit -m "feat(events): create-event form in drawer with patients/forms/users"
```

---

### Task 4: Also add "+ สร้าง Event" button to page header

**Files:**
- Modify: `apps/frontend/src/app/(app)/events/page.tsx`

- [ ] **Step 1: Update page header**

In the page header section (near "แผนการเยี่ยม" Title), change the loading text row to include the CTA:

```tsx
{/* Page header */}
<div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
  <div>
    <div style={{ fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
      Planning
    </div>
    <Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: -1 }}>
      แผนการเยี่ยม
    </Title>
  </div>
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    {loading && <Text type="secondary" style={{ fontSize: 11 }}>กำลังโหลด...</Text>}
    <Button type="primary" onClick={() => { createForm.resetFields(); setDrawerMode('create'); }}>
      + สร้าง Event
    </Button>
  </div>
</div>
```

- [ ] **Step 2: Final TypeScript check and dev smoke test**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/\(app\)/events/page.tsx
git commit -m "feat(events): add create-event CTA to page header"
```
