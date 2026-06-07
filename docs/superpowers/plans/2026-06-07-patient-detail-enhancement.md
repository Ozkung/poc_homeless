# Patient Detail Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the patient profile page from a 3-card server component to a 4-tab layout (ข้อมูล / Timeline / Form History / Care Plan) with hero stats, filterable timeline, expandable form answers, and a care plan checklist.

**Architecture:** Convert `patients/[id]/page.tsx` to render an antd `Tabs` layout. Tabs 1–3 use existing API data. Tab 4 (Care Plan) requires a new `CarePlanItem` Prisma model + 4 REST endpoints + a new `'use client'` component. Backend: add `care-plan` sub-resource under `patients` module.

**Tech Stack:** Next.js 16 server + client components, antd Tabs/Collapse/List, NestJS, Prisma, PostgreSQL.

---

## File Map

| Action | File |
|---|---|
| Modify | `apps/frontend/src/app/(app)/patients/[id]/page.tsx` |
| Create | `apps/frontend/src/app/(app)/patients/[id]/care-plan-tab.tsx` |
| Modify | `apps/backend/prisma/schema.prisma` |
| New migration | run `prisma migrate dev` |
| Modify | `apps/backend/src/modules/patients/patients.controller.ts` |
| Modify | `apps/backend/src/modules/patients/patients.service.ts` |

---

### Task 1: Add CarePlanItem to Prisma schema

**Files:**
- Modify: `apps/backend/prisma/schema.prisma`

- [ ] **Step 1: Add model at end of schema**

```prisma
model CarePlanItem {
  id           String   @id @default(uuid())
  patientId    String
  patient      Patient  @relation(fields: [patientId], references: [id], onDelete: Cascade)
  title        String
  frequency    String
  priority     String   @default("MED")  // HIGH | MED | LOW
  assigneeName String?
  isDone       Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

Also add the reverse relation in `Patient` model:

```prisma
// inside model Patient, add:
carePlanItems CarePlanItem[]
```

- [ ] **Step 2: Run migration**

```bash
cd apps/backend && DATABASE_URL=postgresql://homemed:homemed_dev@localhost:5432/homemed npx prisma migrate dev --name add-care-plan-item
```

Expected: `Your database is now in sync with your schema.`

- [ ] **Step 3: Commit**

```bash
git add apps/backend/prisma/
git commit -m "feat: add CarePlanItem model to Prisma schema"
```

---

### Task 2: Backend — Care Plan CRUD endpoints

**Files:**
- Modify: `apps/backend/src/modules/patients/patients.service.ts`
- Modify: `apps/backend/src/modules/patients/patients.controller.ts`

- [ ] **Step 1: Add service methods**

Open `apps/backend/src/modules/patients/patients.service.ts`. Add after existing methods:

```typescript
async getCarePlan(patientId: string, orgId: string) {
  await this.findOne(patientId, orgId); // ensure patient belongs to org
  return this.prisma.carePlanItem.findMany({
    where: { patientId },
    orderBy: { createdAt: 'asc' },
  });
}

async addCarePlanItem(
  patientId: string,
  orgId: string,
  data: { title: string; frequency: string; priority: string; assigneeName?: string },
) {
  await this.findOne(patientId, orgId);
  return this.prisma.carePlanItem.create({
    data: { patientId, ...data },
  });
}

async updateCarePlanItem(
  patientId: string,
  itemId: string,
  orgId: string,
  data: Partial<{ title: string; frequency: string; priority: string; assigneeName: string; isDone: boolean }>,
) {
  await this.findOne(patientId, orgId);
  return this.prisma.carePlanItem.update({
    where: { id: itemId, patientId },
    data,
  });
}

async deleteCarePlanItem(patientId: string, itemId: string, orgId: string) {
  await this.findOne(patientId, orgId);
  return this.prisma.carePlanItem.delete({
    where: { id: itemId, patientId },
  });
}
```

- [ ] **Step 2: Add controller endpoints**

Open `apps/backend/src/modules/patients/patients.controller.ts`. Add after the existing `:id/submissions` endpoint:

```typescript
@Get(':id/care-plan')
getCarePlan(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
  return this.patients.getCarePlan(id, user.orgId);
}

@Post(':id/care-plan')
@HttpCode(201)
addCarePlanItem(
  @Param('id') id: string,
  @Body() body: { title: string; frequency: string; priority: string; assigneeName?: string },
  @CurrentUser() user: JwtPayload,
) {
  return this.patients.addCarePlanItem(id, user.orgId, body);
}

@Patch(':id/care-plan/:itemId')
updateCarePlanItem(
  @Param('id') id: string,
  @Param('itemId') itemId: string,
  @Body() body: Partial<{ title: string; frequency: string; priority: string; assigneeName: string; isDone: boolean }>,
  @CurrentUser() user: JwtPayload,
) {
  return this.patients.updateCarePlanItem(id, itemId, user.orgId, body);
}

@Delete(':id/care-plan/:itemId')
@HttpCode(204)
deleteCarePlanItem(
  @Param('id') id: string,
  @Param('itemId') itemId: string,
  @CurrentUser() user: JwtPayload,
) {
  return this.patients.deleteCarePlanItem(id, itemId, user.orgId);
}
```

Ensure `HttpCode` is imported from `@nestjs/common` (already should be).

- [ ] **Step 3: TypeScript check backend**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/patients/
git commit -m "feat(backend): care plan CRUD endpoints GET/POST/PATCH/DELETE"
```

---

### Task 3: Frontend — CarePlanTab client component

**Files:**
- Create: `apps/frontend/src/app/(app)/patients/[id]/care-plan-tab.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Button, Checkbox, Form, Input, Modal, Select, Tag, message } from 'antd';
import { Trash2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface CarePlanItem {
  id: string;
  title: string;
  frequency: string;
  priority: 'HIGH' | 'MED' | 'LOW';
  assigneeName?: string;
  isDone: boolean;
}

const PRIORITY_COLOR: Record<string, string> = { HIGH: 'error', MED: 'warning', LOW: 'success' };
const PRIORITY_LABEL: Record<string, string> = { HIGH: 'HIGH', MED: 'MED', LOW: 'LOW' };

export default function CarePlanTab({ patientId }: { patientId: string }) {
  const { data: session } = useSession();
  const [items, setItems] = useState<CarePlanItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const headers = { Authorization: `Bearer ${session?.accessToken ?? ''}` };

  const load = useCallback(() => {
    if (!session?.accessToken) return;
    fetch(`${API_URL}/patients/${patientId}/care-plan`, { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [patientId, session?.accessToken]);

  useEffect(() => { load(); }, [load]);

  async function toggleDone(item: CarePlanItem) {
    const optimistic = items.map((i) => i.id === item.id ? { ...i, isDone: !i.isDone } : i);
    setItems(optimistic);
    await fetch(`${API_URL}/patients/${patientId}/care-plan/${item.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone: !item.isDone }),
    }).catch(() => load()); // revert on error
  }

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`${API_URL}/patients/${patientId}/care-plan/${id}`, {
      method: 'DELETE', headers,
    }).catch(() => load());
  }

  async function handleAdd(values: { title: string; frequency: string; priority: string; assigneeName?: string }) {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/patients/${patientId}/care-plan`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        message.success('เพิ่มแผนการดูแลแล้ว');
        setModalOpen(false);
        form.resetFields();
        load();
      } else {
        message.error('บันทึกไม่สำเร็จ');
      }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: '#888' }}>{items.length} แผน</span>
        <Button size="small" type="primary" onClick={() => setModalOpen(true)}>+ เพิ่มแผน</Button>
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: 'center', color: '#bbb', padding: '40px 0' }}>ยังไม่มีแผนการดูแล</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: 12, background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8,
          }}>
            <Checkbox checked={item.isDone} onChange={() => toggleDone(item)} style={{ marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 13, color: item.isDone ? '#bbb' : '#111',
                textDecoration: item.isDone ? 'line-through' : 'none' }}>
                {item.title}
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                {item.frequency}{item.assigneeName ? ` • ${item.assigneeName}` : ''}
              </div>
            </div>
            <Tag color={PRIORITY_COLOR[item.priority]}>{PRIORITY_LABEL[item.priority]}</Tag>
            <button onClick={() => deleteItem(item.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', padding: '2px 0' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ff4d4f')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#ccc')}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <Modal title="เพิ่มแผนการดูแล" open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        footer={null}>
        <Form form={form} layout="vertical" onFinish={handleAdd}
          initialValues={{ priority: 'MED', frequency: 'ทุกวัน' }}>
          <Form.Item name="title" label="แผนการรักษา / กิจกรรม"
            rules={[{ required: true, message: 'กรุณาใส่รายละเอียดแผน' }]}>
            <Input placeholder="เช่น รับ Metformin 500mg หลังอาหาร" />
          </Form.Item>
          <Form.Item name="frequency" label="ความถี่">
            <Select options={[
              { value: 'ทุกวัน', label: 'ทุกวัน' },
              { value: 'สัปดาห์ละ 1 ครั้ง', label: 'สัปดาห์ละ 1 ครั้ง' },
              { value: 'ทุก 2 สัปดาห์', label: 'ทุก 2 สัปดาห์' },
              { value: 'ทุกเดือน', label: 'ทุกเดือน' },
              { value: 'ทุก 3 เดือน', label: 'ทุก 3 เดือน' },
            ]} />
          </Form.Item>
          <Form.Item name="priority" label="ความสำคัญ">
            <Select options={[
              { value: 'HIGH', label: '🔴 HIGH (ด่วน)' },
              { value: 'MED',  label: '🟡 MED (ปานกลาง)' },
              { value: 'LOW',  label: '🟢 LOW (ติดตาม)' },
            ]} />
          </Form.Item>
          <Form.Item name="assigneeName" label="ผู้รับผิดชอบ">
            <Input placeholder="ชื่อผู้ช่วย CM (ถ้ามี)" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setModalOpen(false); form.resetFields(); }}>ยกเลิก</Button>
            <Button type="primary" htmlType="submit" loading={saving}>บันทึก</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/\(app\)/patients/\[id\]/care-plan-tab.tsx
git commit -m "feat(frontend): CarePlanTab client component"
```

---

### Task 4: Convert patient profile to 4-tab layout

**Files:**
- Modify: `apps/frontend/src/app/(app)/patients/[id]/page.tsx`

- [ ] **Step 1: Replace imports**

At top of file, change antd imports to:

```tsx
import { Card, Collapse, Descriptions, Tag, Timeline } from 'antd';
```

Add the import for the new component:

```tsx
import CarePlanTab from './care-plan-tab';
```

- [ ] **Step 2: Wrap existing content in antd Tabs**

Replace the entire return statement's grid layout with this structure:

```tsx
return (
  <div>
    {/* Breadcrumb */}
    <div style={{ marginBottom: 20 }}>
      <Link href="/patients" style={{ fontSize: 12, color: '#aaa' }}>← ผู้ป่วย</Link>
    </div>

    {/* Header */}
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
      <div>
        <div style={{ fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
          Patient Profile
        </div>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -1, color: '#111' }}>
          {patient.name}
        </h2>
      </div>
      <Tag color={STATUS_COLOR[patient.status]} style={{ fontSize: 13, padding: '4px 14px' }}>
        {STATUS_LABEL[patient.status]}
      </Tag>
    </div>

    {/* Hero stats */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
      {[
        { label: 'Check-in ทั้งหมด', value: activities?.filter((a) => a.type === 'CHECK_IN').length ?? 0, color: '#1677ff' },
        { label: 'Form เดือนนี้', value: submissions?.filter((s) => new Date(s.submittedAt).getMonth() === new Date().getMonth()).length ?? 0, color: '#52c41a' },
        { label: 'กิจกรรมทั้งหมด', value: activities?.length ?? 0, color: '#faad14' },
        { label: 'Form ส่งแล้ว', value: submissions?.length ?? 0, color: '#722ed1' },
      ].map((stat) => (
        <Card key={stat.label} styles={{ body: { padding: '14px 16px', textAlign: 'center' } }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: stat.color, fontFamily: 'monospace' }}>{stat.value}</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{stat.label}</div>
        </Card>
      ))}
    </div>

    {/* 4-tab layout */}
    <Card>
      <Tabs defaultActiveKey="info" items={[
        {
          key: 'info',
          label: 'ข้อมูล',
          children: (
            <Descriptions column={3} size="small" labelStyle={{ color: '#aaa', fontSize: 11 }}>
              <Descriptions.Item label="HN">{patient.hn}</Descriptions.Item>
              <Descriptions.Item label="อายุ">{patient.age ? `${patient.age} ปี` : '—'}</Descriptions.Item>
              <Descriptions.Item label="เพศ">{patient.gender ? GENDER_LABEL[patient.gender] : '—'}</Descriptions.Item>
              <Descriptions.Item label="สถานที่" span={2}>{patient.locationText ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="สถานะ">
                <Tag color={STATUS_COLOR[patient.status]}>{STATUS_LABEL[patient.status]}</Tag>
              </Descriptions.Item>
              {patient.conditions.length > 0 && (
                <Descriptions.Item label="โรคประจำตัว" span={3}>
                  {patient.conditions.map((c) => <Tag key={c} style={{ marginRight: 4 }}>{c}</Tag>)}
                </Descriptions.Item>
              )}
            </Descriptions>
          ),
        },
        {
          key: 'timeline',
          label: 'Timeline',
          children: !activities?.length ? (
            <span style={{ color: '#888', fontSize: 12 }}>ยังไม่มีกิจกรรม</span>
          ) : (
            <Timeline items={activities.slice(0, 20).map((a) => ({
              color: ACTIVITY_COLOR[a.type] ?? '#d9d9d9',
              children: (
                <div>
                  <span style={{ fontSize: 13 }}>{a.actor.displayName}</span>
                  <Tag style={{ marginLeft: 8, fontSize: 10 }}>{a.type}</Tag>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                    {new Date(a.createdAt).toLocaleString('th-TH')}
                  </div>
                  {a.payload?.note && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{a.payload.note}</div>}
                </div>
              ),
            }))} />
          ),
        },
        {
          key: 'formhistory',
          label: 'Form History',
          children: !submissions?.length ? (
            <span style={{ color: '#888', fontSize: 12 }}>ยังไม่มีการส่งแบบฟอร์ม</span>
          ) : (
            <Collapse
              items={submissions.slice(0, 10).map((s) => ({
                key: s.id,
                label: (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace', flexShrink: 0 }}>
                      {new Date(s.submittedAt).toLocaleDateString('th-TH')}
                    </span>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{s.formTemplate.title}</span>
                    <span style={{ fontSize: 11, color: '#888' }}>{s.submittedBy.displayName}</span>
                  </div>
                ),
                children: (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {Array.isArray(s.answers) && (s.answers as any[]).map((ans: any, i: number) => (
                      <div key={i}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>{ans.fieldId}</div>
                        <div style={{ fontSize: 12, padding: '3px 8px', background: '#f5f5f5', borderRadius: 4, display: 'inline-block', marginTop: 2 }}>
                          {String(ans.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                ),
              }))}
            />
          ),
        },
        {
          key: 'careplan',
          label: 'Care Plan',
          children: <CarePlanTab patientId={patient.id} />,
        },
      ]} />
    </Card>
  </div>
);
```

Add `Tabs` to the antd import at top of file.

- [ ] **Step 3: TypeScript check**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/\(app\)/patients/\[id\]/
git commit -m "feat(frontend): patient profile 4-tab layout with hero stats + care plan"
```
