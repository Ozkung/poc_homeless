# Dashboard Highcharts — Severity Analysis & Age Cluster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two Highcharts visualisations to the CM Dashboard — a Donut+Column severity chart inside the hero card, and a Stacked Column age-cluster chart as a new full-width card below the grid.

**Architecture:** Server component fetches patient data → computes counts server-side → passes plain props to two `'use client'` Highcharts components. No client-side fetch. Highcharts is loaded inside `'use client'` boundaries so SSR is never an issue.

**Tech Stack:** Next.js 16 App Router, Highcharts 12, highcharts-react-official, TypeScript, antd Card

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Install | `apps/frontend/package.json` | Add `highcharts` + `highcharts-react-official` |
| Create | `apps/frontend/src/components/charts/SeverityChart.tsx` | `'use client'` Donut + Column chart |
| Create | `apps/frontend/src/components/charts/AgeClusterChart.tsx` | `'use client'` Stacked Column chart |
| Modify | `apps/frontend/src/app/(app)/dashboard/page.tsx` | Remove recent-patients section, add both charts |

---

## Task 1: Install Highcharts packages

**Files:**
- Modify: `apps/frontend/package.json`

- [ ] **Step 1: Install packages**

```bash
cd apps/frontend && npm install highcharts highcharts-react-official
```

- [ ] **Step 2: Verify install**

```bash
cd apps/frontend && npm ls highcharts 2>&1 | head -4
```

Expected output includes `highcharts@12.x.x` and `highcharts-react-official@x.x.x`

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/package.json apps/frontend/package-lock.json
git commit -m "chore: add highcharts + highcharts-react-official"
```

---

## Task 2: SeverityChart — Donut + Column

**Files:**
- Create: `apps/frontend/src/components/charts/SeverityChart.tsx`

- [ ] **Step 1: Create the component**

Create `apps/frontend/src/components/charts/SeverityChart.tsx`:

```tsx
'use client';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';

interface SeverityChartProps {
  critical: number;
  pending: number;
  stable: number;
}

const COLORS = { critical: '#ff4d4f', pending: '#faad14', stable: '#52c41a' };

export default function SeverityChart({ critical, pending, stable }: SeverityChartProps) {
  const total = critical + pending + stable;

  const donutOptions: Highcharts.Options = {
    chart: { type: 'pie', height: 160, margin: [0, 0, 0, 0], backgroundColor: 'transparent' },
    title: { text: undefined },
    credits: { enabled: false },
    legend: { enabled: false },
    tooltip: {
      pointFormat: '<b>{point.y} ราย</b> ({point.percentage:.0f}%)',
    },
    plotOptions: {
      pie: {
        innerSize: '62%',
        dataLabels: { enabled: false },
        center: ['50%', '50%'],
      },
    },
    series: [{
      type: 'pie',
      name: 'ความร้ายแรง',
      data: [
        { name: 'วิกฤต',         y: critical, color: COLORS.critical },
        { name: 'รอดำเนินการ',   y: pending,  color: COLORS.pending },
        { name: 'ปกติ',          y: stable,   color: COLORS.stable },
      ],
    }],
  };

  const columnOptions: Highcharts.Options = {
    chart: { type: 'column', height: 160, margin: [10, 10, 30, 30], backgroundColor: 'transparent' },
    title: { text: undefined },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: {
      categories: ['วิกฤต', 'รอดำเนินการ', 'ปกติ'],
      lineColor: '#f0f0f0',
      tickLength: 0,
      labels: { style: { fontSize: '10px', color: '#888' } },
    },
    yAxis: {
      title: { text: undefined },
      gridLineColor: '#f5f5f5',
      labels: { style: { fontSize: '10px', color: '#888' } },
    },
    tooltip: {
      pointFormat: '<b>{point.y} ราย</b>',
    },
    plotOptions: {
      column: {
        borderRadius: 3,
        colorByPoint: true,
        colors: [COLORS.critical, COLORS.pending, COLORS.stable],
      },
    },
    series: [{
      type: 'column',
      name: 'จำนวน',
      data: [critical, pending, stable],
    }],
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {/* Donut with centre label */}
      <div style={{ position: 'relative', width: 160, flexShrink: 0 }}>
        <HighchartsReact highcharts={Highcharts} options={donutOptions} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#111', lineHeight: 1 }}>{total}</div>
          <div style={{ fontSize: 9, color: '#aaa' }}>ราย</div>
        </div>
      </div>

      {/* Column chart */}
      <div style={{ flex: 1 }}>
        <HighchartsReact highcharts={Highcharts} options={columnOptions} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | grep -E "SeverityChart|error TS" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/charts/SeverityChart.tsx
git commit -m "feat(ui): SeverityChart — Donut + Column Highcharts component"
```

---

## Task 3: AgeClusterChart — Stacked Column

**Files:**
- Create: `apps/frontend/src/components/charts/AgeClusterChart.tsx`

- [ ] **Step 1: Create the component**

Create `apps/frontend/src/components/charts/AgeClusterChart.tsx`:

```tsx
'use client';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';

export interface AgeBand {
  label: string;
  critical: number;
  pending: number;
  stable: number;
}

interface AgeClusterChartProps {
  bands: AgeBand[];
}

export default function AgeClusterChart({ bands }: AgeClusterChartProps) {
  const options: Highcharts.Options = {
    chart: {
      type: 'column',
      height: 220,
      margin: [20, 10, 50, 40],
      backgroundColor: 'transparent',
    },
    title: { text: undefined },
    credits: { enabled: false },
    xAxis: {
      categories: bands.map((b) => b.label),
      lineColor: '#f0f0f0',
      tickLength: 0,
      labels: { style: { fontSize: '11px', color: '#555' } },
    },
    yAxis: {
      title: { text: undefined },
      gridLineColor: '#f5f5f5',
      labels: { style: { fontSize: '10px', color: '#888' } },
      stackLabels: {
        enabled: true,
        style: { fontWeight: '700', color: '#555', fontSize: '10px' },
      },
    },
    legend: {
      align: 'center',
      verticalAlign: 'bottom',
      itemStyle: { fontSize: '11px', color: '#555', fontWeight: '500' },
    },
    tooltip: {
      shared: true,
      useHTML: true,
      headerFormat: '<b style="font-size:12px">{point.key}</b><br/>',
      pointFormat: '<span style="color:{point.color}">●</span> {series.name}: <b>{point.y} ราย</b><br/>',
    },
    plotOptions: {
      column: {
        stacking: 'normal',
        borderRadius: 3,
        groupPadding: 0.15,
      },
    },
    series: [
      {
        type: 'column',
        name: 'วิกฤต',
        color: '#ff4d4f',
        data: bands.map((b) => b.critical),
      },
      {
        type: 'column',
        name: 'รอดำเนินการ',
        color: '#faad14',
        data: bands.map((b) => b.pending),
      },
      {
        type: 'column',
        name: 'ปกติ',
        color: '#52c41a',
        data: bands.map((b) => b.stable),
      },
    ],
  };

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | grep -E "AgeClusterChart|error TS" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/charts/AgeClusterChart.tsx
git commit -m "feat(ui): AgeClusterChart — Stacked Column Highcharts component"
```

---

## Task 4: Wire charts into Dashboard page

**Files:**
- Modify: `apps/frontend/src/app/(app)/dashboard/page.tsx`

The current file fetches `patients` and `eventCount`. We need to:
1. Remove the `recent` variable and "recent patients" JSX section from the hero card
2. Compute `ageBands` from patients
3. Import and render `SeverityChart` + `AgeClusterChart`

- [ ] **Step 1: Replace the entire dashboard page**

Replace entire contents of `apps/frontend/src/app/(app)/dashboard/page.tsx`:

```tsx
export const dynamic = 'force-dynamic';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import { Card, Statistic, Tag, Progress } from 'antd';
import SeverityChart from '@/components/charts/SeverityChart';
import AgeClusterChart, { type AgeBand } from '@/components/charts/AgeClusterChart';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

interface Patient {
  id: string; name: string; hn: string;
  status: 'CRITICAL' | 'PENDING' | 'STABLE';
  locationText?: string; age?: number;
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

function computeAgeBands(patients: Patient[]): AgeBand[] {
  const bands: Record<string, { critical: number; pending: number; stable: number }> = {
    '<20':   { critical: 0, pending: 0, stable: 0 },
    '20–40': { critical: 0, pending: 0, stable: 0 },
    '40–60': { critical: 0, pending: 0, stable: 0 },
    '60+':   { critical: 0, pending: 0, stable: 0 },
    'ไม่ระบุ': { critical: 0, pending: 0, stable: 0 },
  };

  for (const p of patients) {
    const key =
      p.age == null      ? 'ไม่ระบุ'
      : p.age < 20       ? '<20'
      : p.age < 40       ? '20–40'
      : p.age < 60       ? '40–60'
      : '60+';

    const field = p.status === 'CRITICAL' ? 'critical' : p.status === 'PENDING' ? 'pending' : 'stable';
    bands[key][field]++;
  }

  return Object.entries(bands)
    .filter(([, v]) => v.critical + v.pending + v.stable > 0)
    .map(([label, v]) => ({ label, ...v }));
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? '';

  const [patients, eventCount] = await Promise.all([fetchPatients(token), fetchEventCount(token)]);

  const critical = patients.filter((p) => p.status === 'CRITICAL').length;
  const pending  = patients.filter((p) => p.status === 'PENDING').length;
  const stable   = patients.filter((p) => p.status === 'STABLE').length;
  const tracked  = stable + pending;
  const pct = patients.length > 0 ? Math.round((tracked / patients.length) * 100) : 0;
  const ageBands = computeAgeBands(patients);

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
          Overview
        </div>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -1, color: '#111' }}>
          Dashboard
        </h2>
      </div>

      {/* Bento grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>

        {/* Hero card — 2 cols × 2 rows */}
        <Card
          style={{ gridColumn: 'span 2', gridRow: 'span 2', borderTop: '3px solid #1677ff' }}
          styles={{ body: { padding: 24 } }}
        >
          <span style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase' }}>
            ภาพรวมผู้ป่วย
          </span>
          <div style={{ marginTop: 8 }}>
            <Statistic
              value={patients.length}
              valueStyle={{ fontSize: 52, fontWeight: 800, lineHeight: 1 }}
            />
            <span style={{ fontSize: 12, color: '#888' }}>ผู้ป่วยทั้งหมดในระบบ</span>
          </div>
          <Progress
            percent={pct}
            showInfo={false}
            strokeColor="#1677ff"
            trailColor="#f0f0f0"
            style={{ margin: '16px 0 4px' }}
          />
          <span style={{ fontSize: 11, color: '#888' }}>
            ติดตามแล้ว {tracked} ราย · {pct}%
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            <Tag color="error">● {critical} วิกฤต</Tag>
            <Tag color="warning">● {pending} รอดำเนินการ</Tag>
            <Tag color="success">● {stable} ปกติ</Tag>
          </div>

          {/* ★ Severity chart — replaces "recent patients" section */}
          <div style={{ borderTop: '1px solid #f5f5f5', margin: '20px -24px 0', padding: '16px 24px 0' }}>
            <div style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
              วิเคราะห์ตามความร้ายแรง
            </div>
            <SeverityChart critical={critical} pending={pending} stable={stable} />
          </div>
        </Card>

        {/* Critical — 1×1 */}
        <Card style={{ borderTop: '3px solid #ff4d4f' }} styles={{ body: { padding: 24 } }}>
          <span style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase' }}>
            ผู้ป่วยวิกฤต
          </span>
          <div style={{ marginTop: 8 }}>
            <Statistic
              value={critical}
              valueStyle={{ fontSize: 44, fontWeight: 800, color: '#ff4d4f', lineHeight: 1 }}
            />
            <span style={{ fontSize: 12, color: '#888' }}>ต้องการความช่วยเหลือเร่งด่วน</span>
          </div>
        </Card>

        {/* Events — 1×1 */}
        <Card style={{ borderTop: '3px solid #faad14' }} styles={{ body: { padding: 24 } }}>
          <span style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase' }}>
            กิจกรรมเดือนนี้
          </span>
          <div style={{ marginTop: 8 }}>
            <Statistic
              value={eventCount}
              valueStyle={{ fontSize: 44, fontWeight: 800, color: '#faad14', lineHeight: 1 }}
            />
            <span style={{ fontSize: 12, color: '#888' }}>
              {new Date().toLocaleString('th-TH', { month: 'long', year: 'numeric' })}
            </span>
          </div>
        </Card>

        {/* Stable — 1×1 */}
        <Card style={{ borderTop: '3px solid #52c41a' }} styles={{ body: { padding: 24 } }}>
          <span style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase' }}>
            ผู้ป่วยปกติ
          </span>
          <div style={{ marginTop: 8 }}>
            <Statistic
              value={stable}
              valueStyle={{ fontSize: 44, fontWeight: 800, color: '#52c41a', lineHeight: 1 }}
            />
            <span style={{ fontSize: 12, color: '#888' }}>สถานะเสถียร</span>
          </div>
        </Card>

        {/* ★ Age Cluster chart — full 3-col span */}
        <Card
          style={{ gridColumn: 'span 3', borderTop: '3px solid #722ed1' }}
          styles={{ body: { padding: 24 } }}
        >
          <div style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            Cluster ผู้ป่วยตามช่วงอายุ
          </div>
          {ageBands.length === 0 ? (
            <span style={{ fontSize: 12, color: '#bbb' }}>ยังไม่มีข้อมูลผู้ป่วย</span>
          ) : (
            <AgeClusterChart bands={ageBands} />
          )}
        </Card>

      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Build check**

```bash
cd apps/frontend && npm run build 2>&1 | grep -E "error|Error|✓ Compiled" | head -10
```

Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/\(app\)/dashboard/page.tsx
git commit -m "feat(ui): dashboard Highcharts severity + age cluster charts"
```

---

## Self-Review

**Spec coverage:**
- ✅ Install highcharts + highcharts-react-official → Task 1
- ✅ SeverityChart Donut (innerSize 62%) + Column side-by-side → Task 2
- ✅ Centre label on donut showing total → Task 2
- ✅ AgeClusterChart Stacked Column with 3 severity series → Task 3
- ✅ `ไม่ระบุ` band only shown when count > 0 (`filter` in `computeAgeBands`) → Task 4
- ✅ Server-side computation of ageBands, no client fetch → Task 4
- ✅ Remove "recent patients" section from hero card → Task 4
- ✅ `'use client'` boundary on both chart components → Tasks 2 & 3
- ✅ credits disabled, no title on charts → Tasks 2 & 3

**Type consistency:**
- `AgeBand` exported from `AgeClusterChart.tsx` and imported as `type AgeBand` in `dashboard/page.tsx` ✅
- `SeverityChartProps` used internally only ✅
- `computeAgeBands` returns `AgeBand[]` matching `AgeClusterChartProps.bands` ✅

**Placeholder scan:** No TBDs, all code blocks complete.
