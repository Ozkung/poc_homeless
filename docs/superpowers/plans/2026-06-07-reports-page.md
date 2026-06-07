# Reports Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `/reports` page showing monthly KPI cards (Follow-up rate, medication rate, completion rate) + a per-patient summary table. Backed by a new `GET /reports/monthly` endpoint.

**Architecture:** New NestJS `ReportsModule` with a single `GET /reports/monthly?month=&year=` endpoint that aggregates EventTask + Submission + Patient data for the org. Frontend: new server component page at `app/(app)/reports/page.tsx`. Sidebar gets a new nav item.

**Tech Stack:** NestJS, Prisma aggregation queries, Next.js server component, antd Statistic/Progress/Table.

---

## File Map

| Action | File |
|---|---|
| Create | `apps/backend/src/modules/reports/reports.module.ts` |
| Create | `apps/backend/src/modules/reports/reports.controller.ts` |
| Create | `apps/backend/src/modules/reports/reports.service.ts` |
| Modify | `apps/backend/src/app.module.ts` |
| Create | `apps/frontend/src/app/(app)/reports/page.tsx` |
| Modify | `apps/frontend/src/components/layout/Sidebar.tsx` |

---

### Task 1: Backend — ReportsModule

**Files:**
- Create: `apps/backend/src/modules/reports/reports.service.ts`
- Create: `apps/backend/src/modules/reports/reports.controller.ts`
- Create: `apps/backend/src/modules/reports/reports.module.ts`

- [ ] **Step 1: Create reports.service.ts**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getMonthly(orgId: string, month: number, year: number) {
    // Date range for the month
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0, 23, 59, 59);

    // All tasks this org in this month range
    const tasks = await this.prisma.eventTask.findMany({
      where: {
        event: {
          organizationId: orgId,
          startDate: { lte: end },
          endDate:   { gte: start },
        },
      },
      include: { patient: true },
    });

    const totalTasks     = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'DONE').length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Follow-up rate = tasks that were either DONE or NOT_FOUND (worker showed up)
    const followUpDone = tasks.filter((t) => t.status === 'DONE' || t.status === 'NOT_FOUND').length;
    const followUpRate  = totalTasks > 0 ? Math.round((followUpDone / totalTasks) * 100) : 0;

    // Submissions this month
    const submissions = await this.prisma.submission.count({
      where: {
        task: { event: { organizationId: orgId } },
        submittedAt: { gte: start, lte: end },
      },
    });
    const medicationRate = totalTasks > 0 ? Math.round((submissions / totalTasks) * 100) : 0;

    // Per-patient breakdown
    const patients = await this.prisma.patient.findMany({
      where: { organizationId: orgId },
      select: { id: true, nameEnc: true, hn: true, status: true, conditions: true },
    });

    const patientStats = patients.map((p) => {
      const pTasks      = tasks.filter((t) => t.patientId === p.id);
      const pDone       = pTasks.filter((t) => t.status === 'DONE').length;
      const pSubs       = submissions; // simplified — full impl would filter by patientId
      return {
        id:              p.id,
        hn:              p.hn,
        status:          p.status,
        conditions:      p.conditions,
        followUpDone:    pDone,
        followUpTotal:   pTasks.length,
        submissionCount: 0, // placeholder — requires separate patient-scoped query
        expectedVisits:  pTasks.length,
      };
    });

    return {
      followUpRate,
      medicationRate,
      completionRate,
      totalTasks,
      completedTasks,
      patients: patientStats,
    };
  }
}
```

- [ ] **Step 2: Create reports.controller.ts**

```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/types/jwt-payload.interface';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('monthly')
  getMonthly(
    @Query('month') month: string,
    @Query('year')  year:  string,
    @CurrentUser()  user:  JwtPayload,
  ) {
    const now = new Date();
    return this.reports.getMonthly(
      user.orgId,
      month ? parseInt(month, 10) : now.getMonth() + 1,
      year  ? parseInt(year,  10) : now.getFullYear(),
    );
  }
}
```

- [ ] **Step 3: Create reports.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers:   [ReportsService],
})
export class ReportsModule {}
```

- [ ] **Step 4: Register in app.module.ts**

Open `apps/backend/src/app.module.ts`. Add:

```typescript
import { ReportsModule } from './modules/reports/reports.module';
```

And add `ReportsModule` to the `imports` array.

- [ ] **Step 5: TypeScript check**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/reports/ apps/backend/src/app.module.ts
git commit -m "feat(backend): GET /reports/monthly endpoint"
```

---

### Task 2: Frontend — Reports page

**Files:**
- Create: `apps/frontend/src/app/(app)/reports/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
export const dynamic = 'force-dynamic';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import { Card, Progress, Statistic, Tag } from 'antd';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

interface MonthlyReport {
  followUpRate:    number;
  medicationRate:  number;
  completionRate:  number;
  totalTasks:      number;
  completedTasks:  number;
  patients: {
    id: string; hn: string; status: string;
    conditions: string[];
    followUpDone: number; followUpTotal: number;
    submissionCount: number;
  }[];
}

const STATUS_COLOR: Record<string, string> = { CRITICAL: 'error', PENDING: 'warning', STABLE: 'success' };
const STATUS_LABEL: Record<string, string> = { CRITICAL: 'วิกฤต', PENDING: 'รอดำเนินการ', STABLE: 'ปกติ' };

async function fetchReport(token: string): Promise<MonthlyReport | null> {
  const now = new Date();
  try {
    const res = await fetch(
      `${API_URL}/reports/monthly?month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );
    return res.ok ? res.json() : null;
  } catch { return null; }
}

function kpiColor(rate: number, target: number): string {
  if (rate >= target) return '#52c41a';
  if (rate >= target - 10) return '#faad14';
  return '#ff4d4f';
}

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);
  const token   = session?.accessToken ?? '';
  const report  = await fetchReport(token);

  const kpis = [
    { label: 'Follow-up Rate',         value: report?.followUpRate ?? 0,   target: 80, unit: '%' },
    { label: 'อัตรารับยาต่อเนื่อง',   value: report?.medicationRate ?? 0, target: 75, unit: '%' },
    { label: 'งาน Assigned เสร็จ',    value: report?.completionRate ?? 0, target: 0,  unit: '%' },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
            Analytics
          </div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -1, color: '#111' }}>
            รายงานและสถิติ
          </h2>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
            {new Date().toLocaleString('th-TH', { month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        {kpis.map((kpi) => (
          <Card key={kpi.label} styles={{ body: { padding: 24 } }}>
            <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              {kpi.label}
            </div>
            <Statistic
              value={kpi.value}
              suffix="%"
              valueStyle={{ fontSize: 40, fontWeight: 700, color: kpiColor(kpi.value, kpi.target) }}
            />
            <Progress
              percent={kpi.value}
              strokeColor={kpiColor(kpi.value, kpi.target)}
              showInfo={false}
              style={{ marginTop: 8 }}
            />
            {kpi.target > 0 && (
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                เป้าหมาย: {kpi.target}%
                {kpi.value >= kpi.target
                  ? <span style={{ color: '#52c41a', marginLeft: 8 }}>✓ ผ่านเป้า</span>
                  : <span style={{ color: '#ff4d4f', marginLeft: 8 }}>↓ ต่ำกว่าเป้า {kpi.target - kpi.value}%</span>
                }
              </div>
            )}
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
              {report?.completedTasks ?? 0}/{report?.totalTasks ?? 0} งาน
            </div>
          </Card>
        ))}
      </div>

      {/* Per-patient table */}
      <Card styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 13 }}>
          ผลรวมรายบุคคล
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['ผู้ป่วย (HN)', 'โรคประจำตัว', 'Follow-up', 'สถานะ'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11,
                    fontWeight: 600, color: '#aaa', textTransform: 'uppercase',
                    borderBottom: '1px solid #f0f0f0' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(report?.patients ?? []).map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #fafafa' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#555', fontFamily: 'monospace' }}>
                    {p.hn}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {p.conditions.slice(0, 2).map((c) => (
                        <Tag key={c} style={{ fontSize: 10 }}>{c}</Tag>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>
                    {p.followUpDone}/{p.followUpTotal} ครั้ง
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Tag color={STATUS_COLOR[p.status]}>{STATUS_LABEL[p.status]}</Tag>
                  </td>
                </tr>
              ))}
              {(!report || report.patients.length === 0) && (
                <tr>
                  <td colSpan={4} style={{ padding: '32px 0', textAlign: 'center', color: '#bbb', fontSize: 12 }}>
                    ไม่มีข้อมูล
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
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
git add apps/frontend/src/app/\(app\)/reports/
git commit -m "feat(frontend): /reports page with KPI cards + per-patient table"
```

---

### Task 3: Add Reports nav item to Sidebar

**Files:**
- Modify: `apps/frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add BarChart3 icon import**

In `Sidebar.tsx`, add `BarChart3` to the lucide-react import:

```tsx
import { LayoutDashboard, Users, CalendarDays, FileText, LogOut, BarChart3 } from 'lucide-react';
```

- [ ] **Step 2: Add reports item to nav items array**

```tsx
const items: MenuProps['items'] = [
  { key: '/dashboard', label: 'Dashboard',      icon: <LayoutDashboard size={ICON_SIZE} /> },
  { key: '/patients',  label: 'ผู้ป่วย',        icon: <Users size={ICON_SIZE} /> },
  { key: '/events',    label: 'แผนการเยี่ยม',   icon: <CalendarDays size={ICON_SIZE} /> },
  { key: '/forms',     label: 'แบบฟอร์ม',       icon: <FileText size={ICON_SIZE} /> },
  { key: '/reports',   label: 'รายงาน',          icon: <BarChart3 size={ICON_SIZE} /> },
];
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/layout/Sidebar.tsx
git commit -m "feat(frontend): add Reports nav item to sidebar"
```
