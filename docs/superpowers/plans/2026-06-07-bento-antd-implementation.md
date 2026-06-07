# Bento UI Redesign (antd) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current ad-hoc Tailwind UI with Ant Design components and a full bento 3-column CSS Grid layout across all five CM Dashboard pages.

**Architecture:** Install antd v5 with `@ant-design/nextjs-registry` for SSR compatibility in Next.js App Router. A `'use client'` `AntdProvider` wraps the app layout with `ConfigProvider`. CSS Grid handles the bento spanning; antd `Card` fills each cell. Tailwind remains for spacing/layout utilities — no conflict.

**Tech Stack:** Next.js 16.2 (App Router), antd v5, @ant-design/nextjs-registry, Tailwind CSS (layout only), TypeScript

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `apps/frontend/src/components/AntdProvider.tsx` | `'use client'` ConfigProvider with theme tokens |
| Modify | `apps/frontend/src/app/layout.tsx` | Add AntdRegistry for SSR |
| Modify | `apps/frontend/src/app/(app)/layout.tsx` | Wrap with AntdProvider + antd Layout |
| Modify | `apps/frontend/src/components/layout/Sidebar.tsx` | antd Menu component |
| Modify | `apps/frontend/src/app/(app)/dashboard/page.tsx` | Full bento grid with antd Cards |
| Modify | `apps/frontend/src/app/(app)/patients/page.tsx` | antd Table + Input.Search + Segmented |
| Modify | `apps/frontend/src/app/(app)/patients/[id]/page.tsx` | antd Descriptions + Timeline + List |
| Modify | `apps/frontend/src/app/(app)/events/page.tsx` | antd Drawer for event detail |
| Modify | `apps/frontend/src/app/(app)/forms/page.tsx` | antd Table |
| Modify | `apps/frontend/src/app/(app)/forms/new/page.tsx` | antd Card wrapping builder fields |
| Modify | `apps/frontend/src/app/(app)/forms/[id]/builder/page.tsx` | antd Card wrapping builder fields |

---

## Task 1: Install antd and set up providers

**Files:**
- Create: `apps/frontend/src/components/AntdProvider.tsx`
- Modify: `apps/frontend/package.json`
- Modify: `apps/frontend/src/app/layout.tsx`
- Modify: `apps/frontend/src/app/(app)/layout.tsx`

- [ ] **Step 1: Install packages**

```bash
cd apps/frontend
npm install antd @ant-design/nextjs-registry
```

Expected: packages added, no errors.

- [ ] **Step 2: Create AntdProvider component**

Create `apps/frontend/src/components/AntdProvider.tsx`:

```tsx
'use client';
import { ConfigProvider } from 'antd';
import thTH from 'antd/locale/th_TH';
import type { ReactNode } from 'react';

export default function AntdProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={thTH}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 10,
          fontFamily: "'Sarabun', system-ui, sans-serif",
          colorBgContainer: '#ffffff',
          colorBgLayout: '#f0f2f5',
        },
        components: {
          Card: { borderRadiusLG: 14 },
          Table: { borderRadiusLG: 14 },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
```

- [ ] **Step 3: Add AntdRegistry to root layout**

Modify `apps/frontend/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import './globals.css';

export const metadata: Metadata = {
  title: 'HomeMed Connect',
  description: 'ระบบดูแลผู้ป่วยไร้บ้านในชุมชน',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600&family=Syne:wght@600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Wrap app layout with AntdProvider**

Modify `apps/frontend/src/app/(app)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import Sidebar from '@/components/layout/Sidebar';
import AntdProvider from '@/components/AntdProvider';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return (
    <AntdProvider>
      <div className="flex h-screen bg-[#f0f2f5]">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-7">{children}</main>
      </div>
    </AntdProvider>
  );
}
```

- [ ] **Step 5: Verify build compiles**

```bash
cd apps/frontend
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/package.json apps/frontend/src/components/AntdProvider.tsx apps/frontend/src/app/layout.tsx apps/frontend/src/app/\(app\)/layout.tsx
git commit -m "feat(ui): install antd, add AntdRegistry + ConfigProvider"
```

---

## Task 2: Redesign Sidebar with antd Menu

**Files:**
- Modify: `apps/frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Rewrite Sidebar with antd Menu**

Replace entire contents of `apps/frontend/src/components/layout/Sidebar.tsx`:

```tsx
'use client';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Button, Avatar, Typography } from 'antd';
import { signOut, useSession } from 'next-auth/react';
import type { MenuProps } from 'antd';

const { Text } = Typography;

const items: MenuProps['items'] = [
  { key: '/dashboard', label: 'Dashboard', icon: <span>◈</span> },
  { key: '/patients', label: 'ผู้ป่วย', icon: <span>⊕</span> },
  { key: '/events', label: 'แผนการเยี่ยม', icon: <span>▦</span> },
  { key: '/forms', label: 'แบบฟอร์ม', icon: <span>▤</span> },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const selectedKey = items.find((item) => pathname.startsWith(item!.key as string))?.key as string ?? '/dashboard';

  return (
    <aside
      style={{
        width: 220, background: '#fff', borderRight: '1px solid #f0f0f0',
        display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f5f5f5' }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 2 }}>
          HomeMed
        </div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, color: '#111' }}>
          Connect
        </div>
      </div>

      {/* Navigation */}
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={items}
        onClick={({ key }) => router.push(key)}
        style={{ flex: 1, border: 'none', paddingTop: 8 }}
      />

      {/* User footer */}
      <div style={{ padding: 12, borderTop: '1px solid #f5f5f5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#fafafa', borderRadius: 8, marginBottom: 8 }}>
          <Avatar size={28} style={{ background: '#1677ff', fontSize: 11, fontWeight: 700 }}>
            CM
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <Text style={{ fontSize: 12, fontWeight: 600, display: 'block' }} ellipsis>
              {(session as any)?.user?.name ?? 'Case Manager'}
            </Text>
            <Text style={{ fontSize: 10, color: '#bbb', fontFamily: "'JetBrains Mono', monospace" }}>
              CASE_MANAGER
            </Text>
          </div>
        </div>
        <Button
          block
          size="small"
          onClick={() => signOut({ callbackUrl: '/login' })}
          style={{ fontSize: 12 }}
        >
          ออกจากระบบ
        </Button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd apps/frontend && npm run build 2>&1 | grep -E "error|Error|✓" | head -20
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/layout/Sidebar.tsx
git commit -m "feat(ui): sidebar with antd Menu"
```

---

## Task 3: Dashboard — full bento grid

**Files:**
- Modify: `apps/frontend/src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Rewrite dashboard with antd bento grid**

Replace entire contents of `apps/frontend/src/app/(app)/dashboard/page.tsx`:

```tsx
export const dynamic = 'force-dynamic';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import { Card, Statistic, Tag, Progress, Typography, Badge } from 'antd';

const { Text, Title } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Patient {
  id: string; name: string; hn: string;
  status: 'CRITICAL' | 'PENDING' | 'STABLE';
  locationText?: string; age?: number;
}

interface Activity {
  id: string; type: string; createdAt: string;
  payload?: Record<string, string>;
  actor: { displayName: string };
  patient?: { hn: string };
}

async function fetchPatients(token: string): Promise<Patient[]> {
  try {
    const res = await fetch(`${API_URL}/patients`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    return res.ok ? res.json() : [];
  } catch { return []; }
}

async function fetchEventCount(token: string): Promise<number> {
  try {
    const now = new Date();
    const res = await fetch(`${API_URL}/events?month=${now.getMonth() + 1}&year=${now.getFullYear()}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return Array.isArray(data) ? data.length : 0;
  } catch { return 0; }
}

const STATUS_COLOR: Record<string, string> = {
  CRITICAL: '#ff4d4f', PENDING: '#faad14', STABLE: '#52c41a',
};
const STATUS_LABEL: Record<string, string> = {
  CRITICAL: 'วิกฤต', PENDING: 'รอดำเนินการ', STABLE: 'ปกติ',
};
const TAG_PRESET: Record<string, string> = {
  CRITICAL: 'error', PENDING: 'warning', STABLE: 'success',
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? '';

  const [patients, eventCount] = await Promise.all([fetchPatients(token), fetchEventCount(token)]);

  const critical = patients.filter((p) => p.status === 'CRITICAL').length;
  const pending = patients.filter((p) => p.status === 'PENDING').length;
  const stable = patients.filter((p) => p.status === 'STABLE').length;
  const tracked = stable + pending;
  const pct = patients.length > 0 ? Math.round((tracked / patients.length) * 100) : 0;
  const recent = patients.slice(-5).reverse();

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
          Overview
        </div>
        <Title level={2} style={{ margin: 0, fontFamily: "'Syne',sans-serif", fontWeight: 800, letterSpacing: -1 }}>
          Dashboard
        </Title>
      </div>

      {/* Bento grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>

        {/* Hero card — 2 cols × 2 rows */}
        <Card
          style={{ gridColumn: 'span 2', gridRow: 'span 2', borderTop: '3px solid #1677ff' }}
          styles={{ body: { padding: 24 } }}
        >
          <Text type="secondary" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>
            ภาพรวมผู้ป่วย
          </Text>
          <div style={{ marginTop: 8 }}>
            <Statistic value={patients.length} valueStyle={{ fontFamily: "'Syne',sans-serif", fontSize: 52, fontWeight: 800, lineHeight: 1 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>ผู้ป่วยทั้งหมดในระบบ</Text>
          </div>
          <Progress
            percent={pct}
            showInfo={false}
            strokeColor="#1677ff"
            trailColor="#f0f0f0"
            style={{ margin: '16px 0 4px' }}
          />
          <Text type="secondary" style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>
            ติดตามแล้ว {tracked} ราย · {pct}%
          </Text>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            <Tag color="error">● {critical} วิกฤต</Tag>
            <Tag color="warning">● {pending} รอดำเนินการ</Tag>
            <Tag color="success">● {stable} ปกติ</Tag>
          </div>

          <div style={{ height: 1, background: '#f5f5f5', margin: '20px -24px' }} />

          <Text type="secondary" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', display: 'block', marginBottom: 12 }}>
            ผู้ป่วยล่าสุด
          </Text>
          {recent.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>ยังไม่มีข้อมูลผู้ป่วย</Text>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {recent.map((p, i) => (
                <div
                  key={p.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < recent.length - 1 ? '1px solid #fafafa' : 'none' }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${STATUS_COLOR[p.status]}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: STATUS_COLOR[p.status], flexShrink: 0 }}>
                    {p.name?.[0] ?? '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#aaa', fontFamily: "'JetBrains Mono',monospace" }}>HN {p.hn}{p.locationText ? ` · ${p.locationText}` : ''}</div>
                  </div>
                  <Tag color={TAG_PRESET[p.status]}>{STATUS_LABEL[p.status]}</Tag>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Critical count — 1×1 */}
        <Card style={{ borderTop: '3px solid #ff4d4f' }} styles={{ body: { padding: 24 } }}>
          <Text type="secondary" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>ผู้ป่วยวิกฤต</Text>
          <div style={{ marginTop: 8 }}>
            <Statistic value={critical} valueStyle={{ fontFamily: "'Syne',sans-serif", fontSize: 44, fontWeight: 800, color: '#ff4d4f', lineHeight: 1 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>ต้องการความช่วยเหลือเร่งด่วน</Text>
          </div>
        </Card>

        {/* Events count — 1×1 */}
        <Card style={{ borderTop: '3px solid #faad14' }} styles={{ body: { padding: 24 } }}>
          <Text type="secondary" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>กิจกรรมเดือนนี้</Text>
          <div style={{ marginTop: 8 }}>
            <Statistic value={eventCount} valueStyle={{ fontFamily: "'Syne',sans-serif", fontSize: 44, fontWeight: 800, color: '#faad14', lineHeight: 1 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {new Date().toLocaleString('th-TH', { month: 'long', year: 'numeric' })}
            </Text>
          </div>
        </Card>

        {/* Stable count — 1×1 */}
        <Card style={{ borderTop: '3px solid #52c41a' }} styles={{ body: { padding: 24 } }}>
          <Text type="secondary" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>ผู้ป่วยปกติ</Text>
          <div style={{ marginTop: 8 }}>
            <Statistic value={stable} valueStyle={{ fontFamily: "'Syne',sans-serif", fontSize: 44, fontWeight: 800, color: '#52c41a', lineHeight: 1 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>สถานะเสถียร</Text>
          </div>
        </Card>

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

```bash
cd apps/frontend && npm run build 2>&1 | grep -E "error TS|Error:|✓ Compiled" | head -10
```

Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/\(app\)/dashboard/page.tsx
git commit -m "feat(ui): dashboard full bento grid with antd"
```

---

## Task 4: Patients List — antd Table + Segmented + Search

**Files:**
- Modify: `apps/frontend/src/app/(app)/patients/page.tsx`

- [ ] **Step 1: Rewrite patients list**

Replace entire `apps/frontend/src/app/(app)/patients/page.tsx`:

```tsx
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Table, Input, Segmented, Tag, Typography, Card, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Patient {
  id: string; name: string; hn: string;
  status: 'CRITICAL' | 'PENDING' | 'STABLE';
  locationText?: string; age?: number;
}

const STATUS_TAG: Record<string, React.ReactNode> = {
  CRITICAL: <Tag color="error">วิกฤต</Tag>,
  PENDING:  <Tag color="warning">รอดำเนินการ</Tag>,
  STABLE:   <Tag color="success">ปกติ</Tag>,
};

const columns: ColumnsType<Patient> = [
  {
    title: 'ชื่อผู้ป่วย', dataIndex: 'name', key: 'name',
    render: (name, r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{name}</div>
        <Text type="secondary" style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>HN {r.hn}</Text>
      </div>
    ),
  },
  { title: 'สถานะ', dataIndex: 'status', key: 'status', render: (s) => STATUS_TAG[s] ?? <Tag>{s}</Tag>, width: 130 },
  { title: 'อายุ', dataIndex: 'age', key: 'age', render: (a) => a ? `${a} ปี` : '—', width: 80 },
  { title: 'สถานที่', dataIndex: 'locationText', key: 'locationText', render: (l) => l ?? '—' },
  {
    title: '', key: 'action', width: 100,
    render: (_, r) => <Link href={`/patients/${r.id}`}><Button size="small" type="link">ดูโปรไฟล์ →</Button></Link>,
  },
];

const FILTER_OPTIONS = [
  { label: 'ทั้งหมด', value: 'ALL' },
  { label: 'วิกฤต', value: 'CRITICAL' },
  { label: 'รอดำเนินการ', value: 'PENDING' },
  { label: 'ปกติ', value: 'STABLE' },
];

export default function PatientsPage() {
  const { data: session } = useSession();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    if (!session?.accessToken) return;
    fetch(`${API_URL}/patients`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
      .then((r) => r.json())
      .then((data) => { setPatients(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [session?.accessToken]);

  const filtered = patients.filter((p) => {
    const matchStatus = statusFilter === 'ALL' || p.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.hn.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>Patients</div>
          <Title level={2} style={{ margin: 0, fontFamily: "'Syne',sans-serif", fontWeight: 800, letterSpacing: -1 }}>รายชื่อผู้ป่วย</Title>
        </div>
        <Link href="/patients/new"><Button type="primary">+ เพิ่มผู้ป่วย</Button></Link>
      </div>

      <Card styles={{ body: { padding: '16px 24px' } }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <Input.Search
            placeholder="ค้นหาชื่อ หรือ HN..."
            style={{ width: 260 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
          <Segmented
            options={FILTER_OPTIONS}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as string)}
          />
          <Text type="secondary" style={{ fontSize: 12, alignSelf: 'center', marginLeft: 'auto' }}>
            แสดง {filtered.length} จาก {patients.length} ราย
          </Text>
        </div>

        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: 'ไม่มีข้อมูลผู้ป่วย' }}
          size="middle"
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

```bash
cd apps/frontend && npm run build 2>&1 | grep -E "error TS|✓ Compiled" | head -5
```

Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/\(app\)/patients/page.tsx
git commit -m "feat(ui): patients list with antd Table + Segmented filter"
```

---

## Task 5: Patient Profile — antd Descriptions + Timeline

**Files:**
- Modify: `apps/frontend/src/app/(app)/patients/[id]/page.tsx`

- [ ] **Step 1: Rewrite patient profile**

Replace entire `apps/frontend/src/app/(app)/patients/[id]/page.tsx`:

```tsx
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import { Card, Descriptions, Tag, Timeline, List, Typography, Badge } from 'antd';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Patient {
  id: string; name: string; hn: string;
  status: 'CRITICAL' | 'PENDING' | 'STABLE';
  age?: number; gender?: 'MALE' | 'FEMALE' | 'OTHER';
  conditions: string[]; locationText?: string;
}
interface Activity {
  id: string; type: string; createdAt: string;
  payload?: Record<string, string>;
  actor: { displayName: string };
}
interface Submission {
  id: string; submittedAt: string;
  formTemplate: { title: string };
  submittedBy: { displayName: string };
}

const STATUS_COLOR: Record<string, string> = { CRITICAL: 'error', PENDING: 'warning', STABLE: 'success' };
const STATUS_LABEL: Record<string, string> = { CRITICAL: 'วิกฤต', PENDING: 'รอดำเนินการ', STABLE: 'ปกติ' };
const GENDER_LABEL: Record<string, string> = { MALE: 'ชาย', FEMALE: 'หญิง', OTHER: 'อื่นๆ' };
const ACTIVITY_COLOR: Record<string, string> = {
  CHECK_IN: '#1677ff', NOTE: '#722ed1', FORM_SUBMIT: '#13c2c2',
  ASSIGN: '#faad14', STATUS_CHANGE: '#ff4d4f',
};

async function get<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    return res.ok ? res.json() : null;
  } catch { return null; }
}

export default async function PatientProfilePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? '';
  const { id } = params;

  const [patient, activities, submissions] = await Promise.all([
    get<Patient>(`${API_URL}/patients/${id}`, token),
    get<Activity[]>(`${API_URL}/patients/${id}/activities`, token),
    get<Submission[]>(`${API_URL}/patients/${id}/submissions`, token),
  ]);

  if (!patient) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Text type="secondary">ไม่พบข้อมูลผู้ป่วย</Text>
        <div style={{ marginTop: 12 }}><Link href="/patients">← กลับรายชื่อผู้ป่วย</Link></div>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/patients" style={{ fontSize: 12, color: '#aaa' }}>← ผู้ป่วย</Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>Patient Profile</div>
          <Title level={2} style={{ margin: 0, fontFamily: "'Syne',sans-serif", fontWeight: 800, letterSpacing: -1 }}>
            {patient.name}
          </Title>
        </div>
        <Tag color={STATUS_COLOR[patient.status]} style={{ fontSize: 13, padding: '4px 14px' }}>
          {STATUS_LABEL[patient.status]}
        </Tag>
      </div>

      {/* Bento grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>

        {/* Demographics — span 3 */}
        <Card style={{ gridColumn: 'span 3' }} styles={{ body: { padding: 24 } }}>
          <Descriptions column={3} size="small" labelStyle={{ color: '#aaa', fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>
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
        </Card>

        {/* Activity timeline — span 2 */}
        <Card
          title={<Text style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>กิจกรรม</Text>}
          style={{ gridColumn: 'span 2' }}
          styles={{ body: { padding: '16px 24px' } }}
        >
          {!activities?.length ? (
            <Text type="secondary" style={{ fontSize: 12 }}>ยังไม่มีกิจกรรม</Text>
          ) : (
            <Timeline
              items={activities.slice(0, 10).map((a) => ({
                color: ACTIVITY_COLOR[a.type] ?? '#d9d9d9',
                children: (
                  <div>
                    <Text style={{ fontSize: 13 }}>{a.actor.displayName}</Text>
                    <Tag style={{ marginLeft: 8, fontSize: 10 }}>{a.type}</Tag>
                    <div style={{ fontSize: 11, color: '#aaa', fontFamily: "'JetBrains Mono',monospace", marginTop: 2 }}>
                      {new Date(a.createdAt).toLocaleString('th-TH')}
                    </div>
                    {a.payload?.note && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{a.payload.note}</div>}
                  </div>
                ),
              }))}
            />
          )}
        </Card>

        {/* Submissions — span 1 */}
        <Card
          title={<Text style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>แบบฟอร์มที่ส่ง</Text>}
          styles={{ body: { padding: '16px 24px' } }}
        >
          {!submissions?.length ? (
            <Text type="secondary" style={{ fontSize: 12 }}>ยังไม่มีการส่งแบบฟอร์ม</Text>
          ) : (
            <List
              size="small"
              dataSource={submissions.slice(0, 8)}
              renderItem={(s) => (
                <List.Item style={{ padding: '8px 0' }}>
                  <List.Item.Meta
                    title={<Text style={{ fontSize: 13, fontWeight: 600 }}>{s.formTemplate.title}</Text>}
                    description={
                      <div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>{s.submittedBy.displayName}</div>
                        <div style={{ fontSize: 10, color: '#ccc', fontFamily: "'JetBrains Mono',monospace" }}>
                          {new Date(s.submittedAt).toLocaleDateString('th-TH')}
                        </div>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

```bash
cd apps/frontend && npm run build 2>&1 | grep -E "error TS|✓ Compiled" | head -5
```

Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/\(app\)/patients/
git commit -m "feat(ui): patient profile with antd Descriptions + Timeline"
```

---

## Task 6: Events — antd Drawer for event detail

**Files:**
- Modify: `apps/frontend/src/app/(app)/events/page.tsx`

- [ ] **Step 1: Add antd Drawer to events page**

The current events page (`apps/frontend/src/app/(app)/events/page.tsx`) already has a custom calendar grid and side panel. Replace only the side panel with an antd `Drawer` that slides in from the right when a day is selected.

Find the side panel JSX (the `<div>` that shows `selectedDayEvents`) and replace it with an antd Drawer. Add the Drawer import at the top of the file.

At the top of the file, add to the imports:
```tsx
import { Drawer, Card, Tag, Badge, Button, Typography } from 'antd';
const { Text, Title } = Typography;
```

Replace the right-side panel `<div className="flex-[1]...">` with a Drawer trigger. After the calendar grid closing div, add:

```tsx
<Drawer
  title={
    selectedDate
      ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>
          {format(selectedDate, 'd MMMM yyyy', { locale: th })}
        </span>
      : 'กิจกรรม'
  }
  placement="right"
  width={380}
  open={selectedDate !== null}
  onClose={() => setSelectedDate(null)}
  extra={<Button type="primary" size="small">+ เพิ่มกิจกรรม</Button>}
>
  {loading && <div style={{ textAlign: 'center', color: '#aaa', padding: 24 }}>กำลังโหลด...</div>}
  {!loading && selectedDayEvents.length === 0 && (
    <div style={{ textAlign: 'center', color: '#aaa', padding: 24 }}>ไม่มีกิจกรรม</div>
  )}
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    {selectedDayEvents.map((ev) => (
      <Card key={ev.id} size="small" style={{ borderLeft: `3px solid ${PRIORITY_DOT[ev.priority] === 'bg-danger' ? '#ff4d4f' : PRIORITY_DOT[ev.priority] === 'bg-warning' ? '#faad14' : '#1677ff'}` }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{ev.title}</div>
        <Tag color={ev.priority === 'CRITICAL' ? 'error' : ev.priority === 'URGENT' ? 'warning' : 'processing'} style={{ fontSize: 10 }}>
          {PRIORITY_LABEL[ev.priority]}
        </Tag>
        {ev.tasks.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#aaa' }}>
            {ev.tasks.length} งาน · {[...new Set(ev.tasks.map((t) => t.assignee.displayName))].join(', ')}
          </div>
        )}
      </Card>
    ))}
  </div>
</Drawer>
```

Change the outer layout from `flex gap-4` to just the calendar occupying full width (remove the right panel div).

- [ ] **Step 2: Build to verify**

```bash
cd apps/frontend && npm run build 2>&1 | grep -E "error TS|✓ Compiled" | head -5
```

Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/\(app\)/events/page.tsx
git commit -m "feat(ui): events calendar with antd Drawer for event detail"
```

---

## Task 7: Forms — antd Table + Card-wrapped builder

**Files:**
- Modify: `apps/frontend/src/app/(app)/forms/page.tsx`
- Modify: `apps/frontend/src/app/(app)/forms/new/page.tsx`
- Modify: `apps/frontend/src/app/(app)/forms/[id]/builder/page.tsx`

- [ ] **Step 1: Rewrite forms list with antd Table**

Replace entire `apps/frontend/src/app/(app)/forms/page.tsx`:

```tsx
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Table, Button, Card, Popconfirm, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface FormTemplate {
  id: string; title: string; fields: unknown[];
  createdBy: { displayName: string }; updatedAt: string; isActive: boolean;
}

export default function FormsPage() {
  const { data: session } = useSession();
  const [forms, setForms] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!session?.accessToken) return;
    fetch(`${API_URL}/forms`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
      .then((r) => r.json())
      .then((d) => { setForms(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(load, [session?.accessToken]);

  const handleDelete = async (id: string) => {
    await fetch(`${API_URL}/forms/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    });
    setForms((prev) => prev.filter((f) => f.id !== id));
  };

  const columns: ColumnsType<FormTemplate> = [
    {
      title: 'ชื่อแบบฟอร์ม', dataIndex: 'title', key: 'title',
      render: (title) => <span style={{ fontWeight: 600 }}>{title}</span>,
    },
    { title: 'จำนวนฟิลด์', dataIndex: 'fields', key: 'fields', render: (f: unknown[]) => `${f?.length ?? 0} ฟิลด์`, width: 110 },
    { title: 'สร้างโดย', dataIndex: ['createdBy', 'displayName'], key: 'createdBy', width: 150 },
    {
      title: 'อัปเดต', dataIndex: 'updatedAt', key: 'updatedAt', width: 130,
      render: (d) => new Date(d).toLocaleDateString('th-TH'),
    },
    {
      title: '', key: 'actions', width: 140,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/forms/${r.id}/builder`}><Button size="small">แก้ไข</Button></Link>
          <Popconfirm title="ลบแบบฟอร์มนี้?" onConfirm={() => handleDelete(r.id)} okText="ลบ" cancelText="ยกเลิก">
            <Button size="small" danger>ลบ</Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>Forms</div>
          <Title level={2} style={{ margin: 0, fontFamily: "'Syne',sans-serif", fontWeight: 800, letterSpacing: -1 }}>แบบฟอร์ม</Title>
        </div>
        <Link href="/forms/new"><Button type="primary">+ สร้างแบบฟอร์ม</Button></Link>
      </div>
      <Card styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns} dataSource={forms} rowKey="id"
          loading={loading} size="middle"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: 'ยังไม่มีแบบฟอร์ม' }}
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Wrap form builder field items in antd Card**

In `apps/frontend/src/app/(app)/forms/new/page.tsx`, add `Card` import at the top:
```tsx
import { Card } from 'antd';
```

In the `SortableField` component, change the outermost `<div ref={setNodeRef} ...>` wrapper to:
```tsx
<Card
  ref={setNodeRef}
  style={{ ...style, marginBottom: 0 }}
  styles={{ body: { padding: '12px 16px' } }}
  size="small"
>
  {/* keep existing interior JSX unchanged */}
</Card>
```

Apply the same change to `apps/frontend/src/app/(app)/forms/[id]/builder/page.tsx` (same `SortableField` component exists there).

- [ ] **Step 3: Build to verify**

```bash
cd apps/frontend && npm run build 2>&1 | grep -E "error TS|✓ Compiled" | head -5
```

Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/\(app\)/forms/
git commit -m "feat(ui): forms list with antd Table + Popconfirm, builder with antd Card"
```

---

## Verification

After all tasks complete, run:

```bash
docker compose up --build -d
```

Then open `http://localhost:3000` and verify:
- [ ] Login page works (unchanged)
- [ ] Sidebar shows antd Menu with active highlight
- [ ] Dashboard shows bento grid — hero 2×2, critical/events/stable cards
- [ ] Patients list shows antd Table with Segmented filter and search
- [ ] Patient profile shows antd Descriptions + Timeline
- [ ] Events calendar drawer opens when day is clicked
- [ ] Forms list shows antd Table with edit/delete
- [ ] Form builder fields use antd Card styling
