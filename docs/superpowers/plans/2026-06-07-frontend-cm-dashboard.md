# Frontend CM Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all stub pages in the CM dashboard with real API-connected UIs: dashboard stats, patients list, patient detail + timeline, events calendar, forms list, and a save-wired form builder.

**Architecture:** `@tanstack/react-query` is already installed. Create a `providers.tsx` that wraps the app with `QueryClientProvider`, then build typed hooks per resource. Each page uses those hooks. Route `/patients/[id]` is new. Events calendar uses `@fullcalendar/react`. The form builder save calls `POST /forms`. Form edit route `/forms/[id]/builder` is added alongside the existing `/forms/new`.

**Tech Stack:** Next.js 16 (App Router), React Query v5, Tailwind CSS, FullCalendar (`@fullcalendar/react` + `@fullcalendar/daygrid` + `@fullcalendar/interaction`), axios (already installed), `date-fns` (already installed), `@homemed/shared-types`

---

## File Map

| Action | File |
|---|---|
| Create | `apps/frontend/src/app/providers.tsx` |
| Modify | `apps/frontend/src/app/layout.tsx` |
| Create | `apps/frontend/src/hooks/usePatients.ts` |
| Create | `apps/frontend/src/hooks/useEvents.ts` |
| Create | `apps/frontend/src/hooks/useForms.ts` |
| Create | `apps/frontend/src/hooks/useDashboard.ts` |
| Modify | `apps/frontend/src/app/(app)/dashboard/page.tsx` |
| Modify | `apps/frontend/src/app/(app)/patients/page.tsx` |
| Create | `apps/frontend/src/app/(app)/patients/[id]/page.tsx` |
| Modify | `apps/frontend/src/app/(app)/events/page.tsx` |
| Modify | `apps/frontend/src/app/(app)/forms/page.tsx` |
| Modify | `apps/frontend/src/app/(app)/forms/new/page.tsx` |
| Create | `apps/frontend/src/app/(app)/forms/[id]/builder/page.tsx` |

---

### Task 1: Set Up React Query Provider

`@tanstack/react-query` is already in `package.json` but no `QueryClientProvider` is wired into the app.

**Files:**
- Create: `apps/frontend/src/app/providers.tsx`
- Modify: `apps/frontend/src/app/layout.tsx`

- [ ] **Step 1: Create providers.tsx**

Create `apps/frontend/src/app/providers.tsx`:

```tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 2: Wrap layout.tsx with Providers**

Open `apps/frontend/src/app/layout.tsx`. Add the import and wrap children:

```tsx
import type { Metadata } from 'next';
import { Syne, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const syne = Syne({ subsets: ['latin'], variable: '--font-syne' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = { title: 'HomeMed Connect' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className={`${syne.variable} ${mono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify build compiles**

```bash
cd apps/frontend && npm run build 2>&1 | tail -20
```

Expected: no errors, `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/providers.tsx apps/frontend/src/app/layout.tsx
git commit -m "feat: wire React Query provider into root layout"
```

---

### Task 2: API Hooks — Typed React Query Hooks per Resource

Build a thin hooks layer that each page imports. `apiClient` (axios) already handles Auth header injection.

**Files:**
- Create: `apps/frontend/src/hooks/usePatients.ts`
- Create: `apps/frontend/src/hooks/useEvents.ts`
- Create: `apps/frontend/src/hooks/useForms.ts`
- Create: `apps/frontend/src/hooks/useDashboard.ts`

- [ ] **Step 1: Create usePatients.ts**

Create `apps/frontend/src/hooks/usePatients.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface Patient {
  id: string;
  name: string;
  hn: string;
  age?: number;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  status: 'CRITICAL' | 'PENDING' | 'STABLE';
  conditions: string[];
  locationText?: string;
  caseManagerId?: string;
}

export interface Activity {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
  actor: { displayName: string; role: string };
}

const PATIENTS_KEY = ['patients'] as const;

export function usePatients() {
  return useQuery({
    queryKey: PATIENTS_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<Patient[]>('/patients');
      return data;
    },
  });
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: [...PATIENTS_KEY, id],
    queryFn: async () => {
      const { data } = await apiClient.get<Patient>(`/patients/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function usePatientActivities(id: string) {
  return useQuery({
    queryKey: [...PATIENTS_KEY, id, 'activities'],
    queryFn: async () => {
      const { data } = await apiClient.get<Activity[]>(`/patients/${id}/activities`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<Patient, 'id'>) => apiClient.post<Patient>('/patients', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: PATIENTS_KEY }),
  });
}
```

- [ ] **Step 2: Create useEvents.ts**

Create `apps/frontend/src/hooks/useEvents.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  priority: 'NORMAL' | 'URGENT' | 'CRITICAL';
  note?: string;
  tasks: {
    id: string;
    status: string;
    assignee: { displayName: string };
    patient: { hn: string; nameEnc: string };
  }[];
}

const EVENTS_KEY = ['events'] as const;

export function useEvents(month: number, year: number) {
  return useQuery({
    queryKey: [...EVENTS_KEY, month, year],
    queryFn: async () => {
      const { data } = await apiClient.get<CalendarEvent[]>(`/events?month=${month}&year=${year}`);
      return data;
    },
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string; startDate: string; endDate: string;
      priority?: string; note?: string; patientIds?: string[]; assigneeId?: string;
    }) => apiClient.post<CalendarEvent>('/events', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: EVENTS_KEY }),
  });
}
```

- [ ] **Step 3: Create useForms.ts**

Create `apps/frontend/src/hooks/useForms.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type { FormField } from '@homemed/shared-types';

export interface FormTemplate {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const FORMS_KEY = ['forms'] as const;

export function useForms() {
  return useQuery({
    queryKey: FORMS_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<FormTemplate[]>('/forms');
      return data;
    },
  });
}

export function useForm(id: string) {
  return useQuery({
    queryKey: [...FORMS_KEY, id],
    queryFn: async () => {
      const { data } = await apiClient.get<FormTemplate>(`/forms/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; fields: FormField[] }) =>
      apiClient.post<FormTemplate>('/forms', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: FORMS_KEY }),
  });
}

export function useUpdateForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; title: string; fields: FormField[] }) =>
      apiClient.put<FormTemplate>(`/forms/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: FORMS_KEY }),
  });
}
```

- [ ] **Step 4: Create useDashboard.ts**

Create `apps/frontend/src/hooks/useDashboard.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { usePatients } from './usePatients';
import { useEvents } from './useEvents';

export function useDashboardStats() {
  const today = new Date();
  const { data: patients = [], isLoading: pLoading } = usePatients();
  const { data: events = [], isLoading: eLoading } = useEvents(today.getMonth() + 1, today.getFullYear());

  const totalPatients = patients.length;
  const criticalPatients = patients.filter((p) => p.status === 'CRITICAL').length;
  const todayStr = today.toISOString().slice(0, 10);
  const todayEvents = events.filter(
    (e) => e.startDate.slice(0, 10) <= todayStr && e.endDate.slice(0, 10) >= todayStr,
  );
  const todayTasks = todayEvents.flatMap((e) => e.tasks ?? []).length;
  const pendingTasks = todayEvents
    .flatMap((e) => e.tasks ?? [])
    .filter((t) => t.status === 'PENDING').length;

  return {
    totalPatients,
    criticalPatients,
    todayTasks,
    pendingTasks,
    isLoading: pLoading || eLoading,
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/
git commit -m "feat: React Query hooks for patients, events, forms, dashboard"
```

---

### Task 3: Dashboard Page — Real Stats

**Files:**
- Modify: `apps/frontend/src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Replace dashboard stub with real data**

Replace entire contents of `apps/frontend/src/app/(app)/dashboard/page.tsx`:

```tsx
'use client';
import { useDashboardStats } from '@/hooks/useDashboard';

export default function DashboardPage() {
  const { totalPatients, criticalPatients, todayTasks, pendingTasks, isLoading } =
    useDashboardStats();

  const cards = [
    { label: 'ผู้ป่วยทั้งหมด', value: totalPatients, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
    { label: 'วิกฤต', value: criticalPatients, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
    { label: 'งานวันนี้', value: todayTasks, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
    { label: 'รอดำเนินการ', value: pendingTasks, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  ];

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-mono text-purple-400 tracking-widest uppercase mb-1">Overview</p>
        <h1 className="font-display text-2xl font-bold text-gray-900">Dashboard</h1>
      </div>
      <div className="grid grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className={`border rounded-xl p-5 ${card.bg}`}>
            <p className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">{card.label}</p>
            {isLoading ? (
              <div className="h-10 w-16 bg-gray-200 animate-pulse rounded" />
            ) : (
              <p className={`text-4xl font-display font-bold ${card.color}`}>{card.value}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/app/(app)/dashboard/page.tsx
git commit -m "feat: dashboard page wired to real API stats"
```

---

### Task 4: Patients List Page

**Files:**
- Modify: `apps/frontend/src/app/(app)/patients/page.tsx`

- [ ] **Step 1: Replace patients stub with data table**

Replace entire contents of `apps/frontend/src/app/(app)/patients/page.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { useState } from 'react';
import { usePatients } from '@/hooks/usePatients';

const STATUS_LABEL: Record<string, string> = {
  CRITICAL: 'วิกฤต',
  PENDING: 'รอติดตาม',
  STABLE: 'ปกติ',
};
const STATUS_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  PENDING: 'bg-amber-100 text-amber-700',
  STABLE: 'bg-green-100 text-green-700',
};

export default function PatientsPage() {
  const { data: patients = [], isLoading } = usePatients();
  const [search, setSearch] = useState('');

  const filtered = patients.filter(
    (p) =>
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.hn.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-mono text-purple-400 tracking-widest uppercase mb-1">Patients</p>
          <h1 className="font-display text-2xl font-bold text-gray-900">รายชื่อผู้ป่วย</h1>
        </div>
        <Link
          href="/patients/new"
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          + เพิ่มผู้ป่วย
        </Link>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ค้นหาชื่อหรือ HN..."
        className="w-full mb-4 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-purple-400"
      />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
          <p className="text-4xl mb-3">🏥</p>
          <p className="font-mono text-sm">ไม่พบผู้ป่วย</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-mono text-xs text-gray-400 uppercase">HN</th>
                <th className="text-left px-4 py-3 font-mono text-xs text-gray-400 uppercase">ชื่อ</th>
                <th className="text-left px-4 py-3 font-mono text-xs text-gray-400 uppercase">สถานะ</th>
                <th className="text-left px-4 py-3 font-mono text-xs text-gray-400 uppercase">อายุ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-purple-600">{p.hn}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.age ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/patients/${p.id}`} className="text-xs text-purple-600 hover:underline">
                      ดูข้อมูล →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/app/(app)/patients/page.tsx
git commit -m "feat: patients list page with real data and search"
```

---

### Task 5: Patient Detail Page — Profile + Activity Timeline

**Files:**
- Create: `apps/frontend/src/app/(app)/patients/[id]/page.tsx`

- [ ] **Step 1: Create the patient detail page**

Create `apps/frontend/src/app/(app)/patients/[id]/page.tsx`:

```tsx
'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { usePatient, usePatientActivities } from '@/hooks/usePatients';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

const STATUS_LABEL: Record<string, string> = {
  CRITICAL: 'วิกฤต', PENDING: 'รอติดตาม', STABLE: 'ปกติ',
};
const STATUS_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-600 bg-red-50 border-red-200',
  PENDING: 'text-amber-600 bg-amber-50 border-amber-200',
  STABLE: 'text-green-600 bg-green-50 border-green-200',
};
const ACTIVITY_ICON: Record<string, string> = {
  CHECK_IN: '📍', NOTE: '📝', FORM_SUBMIT: '📋', ASSIGN: '👤',
  STATUS_CHANGE: '🔄', LOGIN: '🔑', LOGOUT: '🚪',
};

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: patient, isLoading: pLoading } = usePatient(id);
  const { data: activities = [], isLoading: aLoading } = usePatientActivities(id);

  if (pLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-xl" />)}
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">🏥</p>
        <p>ไม่พบข้อมูลผู้ป่วย</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/patients" className="text-gray-400 hover:text-gray-600 text-sm">← กลับ</Link>
        <span className="text-gray-200">/</span>
        <p className="text-sm font-mono text-purple-500">HN: {patient.hn}</p>
      </div>

      {/* Profile card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900">{patient.name}</h1>
            <p className="font-mono text-xs text-gray-400 mt-1">HN: {patient.hn}</p>
          </div>
          <span
            className={`text-sm font-semibold px-3 py-1.5 rounded-full border ${STATUS_COLOR[patient.status]}`}
          >
            {STATUS_LABEL[patient.status]}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="font-mono text-xs text-gray-400 uppercase tracking-wider mb-1">อายุ</p>
            <p className="font-medium text-gray-700">{patient.age ?? '—'} ปี</p>
          </div>
          <div>
            <p className="font-mono text-xs text-gray-400 uppercase tracking-wider mb-1">เพศ</p>
            <p className="font-medium text-gray-700">
              {{ MALE: 'ชาย', FEMALE: 'หญิง', OTHER: 'อื่น' }[patient.gender ?? ''] ?? '—'}
            </p>
          </div>
          <div>
            <p className="font-mono text-xs text-gray-400 uppercase tracking-wider mb-1">พื้นที่</p>
            <p className="font-medium text-gray-700">{patient.locationText ?? '—'}</p>
          </div>
        </div>

        {patient.conditions.length > 0 && (
          <div className="mt-4">
            <p className="font-mono text-xs text-gray-400 uppercase tracking-wider mb-2">โรคประจำตัว</p>
            <div className="flex flex-wrap gap-1.5">
              {patient.conditions.map((c) => (
                <span key={c} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div>
        <p className="font-mono text-xs text-gray-400 uppercase tracking-wider mb-3">Activity Timeline</p>
        {aLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 animate-pulse rounded-lg" />)}
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">ยังไม่มี activity</div>
        ) : (
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-100" />
            <div className="space-y-3">
              {activities.map((a) => (
                <div key={a.id} className="flex gap-4 items-start">
                  <div className="w-10 h-10 shrink-0 bg-white border border-gray-200 rounded-full flex items-center justify-center text-base z-10">
                    {ACTIVITY_ICON[a.type] ?? '•'}
                  </div>
                  <div className="flex-1 bg-white border border-gray-100 rounded-lg px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-700">{a.actor.displayName}</span>
                      <span className="font-mono text-xs text-gray-400">
                        {format(new Date(a.createdAt), 'd MMM HH:mm', { locale: th })}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-gray-500 mt-0.5">{a.type.toLowerCase().replace('_', ' ')}</p>
                    {a.payload && typeof a.payload === 'object' && (a.payload as any).note && (
                      <p className="text-xs text-gray-600 mt-1 italic">"{(a.payload as any).note}"</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/app/(app)/patients/
git commit -m "feat: patient detail page with profile and activity timeline"
```

---

### Task 6: Events Calendar with FullCalendar

**Files:**
- Modify: `apps/frontend/src/app/(app)/events/page.tsx`

- [ ] **Step 1: Install FullCalendar**

```bash
cd apps/frontend && npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/interaction
```

- [ ] **Step 2: Replace events stub with calendar**

Replace entire contents of `apps/frontend/src/app/(app)/events/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useEvents } from '@/hooks/useEvents';

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444',
  URGENT: '#f59e0b',
  NORMAL: '#7c6af7',
};

export default function EventsPage() {
  const [viewDate, setViewDate] = useState(new Date());
  const { data: events = [], isLoading } = useEvents(
    viewDate.getMonth() + 1,
    viewDate.getFullYear(),
  );

  const calendarEvents = events.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.startDate,
    end: e.endDate,
    backgroundColor: PRIORITY_COLOR[e.priority] ?? '#7c6af7',
    borderColor: PRIORITY_COLOR[e.priority] ?? '#7c6af7',
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-mono text-purple-400 tracking-widest uppercase mb-1">Planning</p>
          <h1 className="font-display text-2xl font-bold text-gray-900">แผนการเยี่ยม</h1>
        </div>
        <Link
          href="/events/new"
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          + สร้าง Event
        </Link>
      </div>

      {isLoading && (
        <div className="h-96 bg-gray-100 animate-pulse rounded-xl mb-4" />
      )}

      {!isLoading && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            events={calendarEvents}
            locale="th"
            headerToolbar={{ left: 'prev', center: 'title', right: 'next' }}
            height="auto"
            datesSet={(info) => setViewDate(info.start)}
            eventContent={(info) => (
              <div className="px-1.5 py-0.5 text-xs font-semibold truncate text-white">
                {info.event.title}
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/(app)/events/page.tsx apps/frontend/package.json apps/frontend/package-lock.json
git commit -m "feat: events calendar page with FullCalendar and real API data"
```

---

### Task 7: Forms List Page — Real Data

**Files:**
- Modify: `apps/frontend/src/app/(app)/forms/page.tsx`

- [ ] **Step 1: Replace forms stub with data list**

Replace entire contents of `apps/frontend/src/app/(app)/forms/page.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { useForms } from '@/hooks/useForms';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

export default function FormsPage() {
  const { data: forms = [], isLoading } = useForms();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-mono text-purple-400 tracking-widest uppercase mb-1">Forms</p>
          <h1 className="font-display text-2xl font-bold text-gray-900">แบบฟอร์ม</h1>
        </div>
        <Link
          href="/forms/new"
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          + สร้างแบบฟอร์ม
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />)}
        </div>
      ) : forms.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-mono text-sm">ยังไม่มีแบบฟอร์ม</p>
        </div>
      ) : (
        <div className="space-y-2">
          {forms.map((f) => (
            <div
              key={f.id}
              className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between hover:border-purple-300 transition-colors"
            >
              <div>
                <p className="font-semibold text-gray-900">{f.title}</p>
                <p className="font-mono text-xs text-gray-400 mt-0.5">
                  {(f.fields as any[]).length} ฟิลด์ · อัพเดต {format(new Date(f.updatedAt), 'd MMM yy', { locale: th })}
                </p>
              </div>
              <Link
                href={`/forms/${f.id}/builder`}
                className="text-xs text-purple-600 hover:underline"
              >
                แก้ไข →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/app/(app)/forms/page.tsx
git commit -m "feat: forms list page with real data and edit links"
```

---

### Task 8: Form Builder — Save to API + Edit Route

Wire the create form builder to `POST /forms` and create an edit route at `/forms/[id]/builder` that pre-fills from `GET /forms/:id`.

**Files:**
- Modify: `apps/frontend/src/app/(app)/forms/new/page.tsx`
- Create: `apps/frontend/src/app/(app)/forms/[id]/builder/page.tsx`

- [ ] **Step 1: Update new/page.tsx to call POST /forms**

Open `apps/frontend/src/app/(app)/forms/new/page.tsx`. Replace the save button handler and add the mutation import.

Add at the top of the file (after the existing imports):

```tsx
import { useRouter } from 'next/navigation';
import { useCreateForm } from '@/hooks/useForms';
```

Replace the `FormBuilderPage` component — add router and mutation, replace console.log:

```tsx
export default function FormBuilderPage() {
  const [title, setTitle] = useState('');
  const [fields, setFields] = useState<FormField[]>([]);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const createForm = useCreateForm();

  // ... keep sensors, addField, updateField, removeField, handleDragEnd unchanged ...

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createForm.mutateAsync({ title, fields });
      router.push('/forms');
    } finally {
      setSaving(false);
    }
  }

  // In the JSX, replace the save button:
  // <button
  //   className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
  //   onClick={handleSave}
  //   disabled={saving || !title.trim()}
  // >
  //   {saving ? 'กำลังบันทึก...' : 'บันทึกแบบฟอร์ม'}
  // </button>
```

Full updated file content — replace `apps/frontend/src/app/(app)/forms/new/page.tsx`:

```tsx
'use client';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FormField, FieldType } from '@homemed/shared-types';
import { useCreateForm } from '@/hooks/useForms';

const FIELD_TYPES: { type: FieldType; label: string; icon: string }[] = [
  { type: 'text', label: 'ข้อความ', icon: '📝' },
  { type: 'number', label: 'ตัวเลข', icon: '🔢' },
  { type: 'select', label: 'ตัวเลือก', icon: '📌' },
  { type: 'radio', label: 'Radio', icon: '🔘' },
  { type: 'checkbox', label: 'Checkbox', icon: '☑️' },
  { type: 'scale', label: 'สเกล', icon: '📊' },
  { type: 'date', label: 'วันที่', icon: '📅' },
  { type: 'textarea', label: 'ข้อความยาว', icon: '📄' },
];

function SortableField({ field, onUpdate, onRemove }: {
  field: FormField; onUpdate: (f: FormField) => void; onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-3">
      <button {...attributes} {...listeners} className="text-gray-300 hover:text-gray-500 cursor-grab mt-1">⠿</button>
      <div className="flex-1 space-y-2">
        <input
          value={field.label}
          onChange={(e) => onUpdate({ ...field, label: e.target.value })}
          placeholder="Label ของฟิลด์"
          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-purple-400"
        />
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{field.type}</span>
          <label className="flex items-center gap-1 text-xs text-gray-500">
            <input type="checkbox" checked={field.required} onChange={(e) => onUpdate({ ...field, required: e.target.checked })} />
            จำเป็น
          </label>
        </div>
        {['select', 'radio', 'checkbox', 'multiselect'].includes(field.type) && (
          <input
            value={(field.options ?? []).join(', ')}
            onChange={(e) => onUpdate({ ...field, options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            placeholder="ตัวเลือก คั่นด้วย comma เช่น ใช่, ไม่ใช่"
            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-400"
          />
        )}
        {field.type === 'scale' && (
          <div className="flex gap-2">
            <input
              type="number"
              value={field.min ?? 0}
              onChange={(e) => onUpdate({ ...field, min: +e.target.value })}
              placeholder="Min"
              className="w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-400"
            />
            <input
              type="number"
              value={field.max ?? 10}
              onChange={(e) => onUpdate({ ...field, max: +e.target.value })}
              placeholder="Max"
              className="w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-400"
            />
          </div>
        )}
      </div>
      <button onClick={() => onRemove(field.id)} className="text-gray-300 hover:text-red-400 transition-colors text-sm">✕</button>
    </div>
  );
}

export default function NewFormPage() {
  const [title, setTitle] = useState('');
  const [fields, setFields] = useState<FormField[]>([]);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const createForm = useCreateForm();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const addField = useCallback((type: FieldType) => {
    const id = Math.random().toString(36).slice(2);
    setFields((prev) => [...prev, { id, type, label: '', required: false, order: prev.length }]);
  }, []);

  const updateField = useCallback((updated: FormField) => {
    setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }, []);

  const removeField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }, []);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFields((prev) => {
        const oldIndex = prev.findIndex((f) => f.id === active.id);
        const newIndex = prev.findIndex((f) => f.id === over.id);
        return arrayMove(prev, oldIndex, newIndex).map((f, i) => ({ ...f, order: i }));
      });
    }
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createForm.mutateAsync({ title, fields });
      router.push('/forms');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-mono text-purple-400 tracking-widest uppercase mb-1">Form Builder</p>
        <h1 className="font-display text-2xl font-bold text-gray-900">สร้างแบบฟอร์มใหม่</h1>
      </div>
      <div className="flex gap-6">
        <div className="w-52 shrink-0">
          <p className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">ประเภทฟิลด์</p>
          <div className="space-y-1.5">
            {FIELD_TYPES.map((ft) => (
              <button
                key={ft.type}
                onClick={() => addField(ft.type)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-purple-400 hover:text-purple-600 transition-colors"
              >
                <span>{ft.icon}</span>
                <span>{ft.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ชื่อแบบฟอร์ม..."
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-lg font-semibold mb-4 focus:outline-none focus:border-purple-400"
          />
          {fields.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-gray-400">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-sm">คลิกประเภทฟิลด์ทางซ้ายเพื่อเพิ่ม</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {fields.map((field) => (
                    <SortableField key={field.id} field={field} onUpdate={updateField} onRemove={removeField} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
          <div className="mt-4 flex justify-end gap-3">
            <button onClick={() => router.push('/forms')} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">ยกเลิก</button>
            <button
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
              onClick={handleSave}
              disabled={saving || !title.trim()}
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกแบบฟอร์ม'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the edit route /forms/[id]/builder/page.tsx**

Create `apps/frontend/src/app/(app)/forms/[id]/builder/page.tsx`:

```tsx
'use client';
import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FormField, FieldType } from '@homemed/shared-types';
import { useForm, useUpdateForm } from '@/hooks/useForms';

// Reuse the same FIELD_TYPES and SortableField from new/page.tsx
const FIELD_TYPES: { type: FieldType; label: string; icon: string }[] = [
  { type: 'text', label: 'ข้อความ', icon: '📝' },
  { type: 'number', label: 'ตัวเลข', icon: '🔢' },
  { type: 'select', label: 'ตัวเลือก', icon: '📌' },
  { type: 'radio', label: 'Radio', icon: '🔘' },
  { type: 'checkbox', label: 'Checkbox', icon: '☑️' },
  { type: 'scale', label: 'สเกล', icon: '📊' },
  { type: 'date', label: 'วันที่', icon: '📅' },
  { type: 'textarea', label: 'ข้อความยาว', icon: '📄' },
];

function SortableField({ field, onUpdate, onRemove }: {
  field: FormField; onUpdate: (f: FormField) => void; onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-3">
      <button {...attributes} {...listeners} className="text-gray-300 hover:text-gray-500 cursor-grab mt-1">⠿</button>
      <div className="flex-1 space-y-2">
        <input
          value={field.label}
          onChange={(e) => onUpdate({ ...field, label: e.target.value })}
          placeholder="Label ของฟิลด์"
          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-purple-400"
        />
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{field.type}</span>
          <label className="flex items-center gap-1 text-xs text-gray-500">
            <input type="checkbox" checked={field.required} onChange={(e) => onUpdate({ ...field, required: e.target.checked })} />
            จำเป็น
          </label>
        </div>
        {['select', 'radio', 'checkbox', 'multiselect'].includes(field.type) && (
          <input
            value={(field.options ?? []).join(', ')}
            onChange={(e) => onUpdate({ ...field, options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            placeholder="ตัวเลือก คั่นด้วย comma เช่น ใช่, ไม่ใช่"
            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-400"
          />
        )}
        {field.type === 'scale' && (
          <div className="flex gap-2">
            <input type="number" value={field.min ?? 0} onChange={(e) => onUpdate({ ...field, min: +e.target.value })} placeholder="Min"
              className="w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-400" />
            <input type="number" value={field.max ?? 10} onChange={(e) => onUpdate({ ...field, max: +e.target.value })} placeholder="Max"
              className="w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-400" />
          </div>
        )}
      </div>
      <button onClick={() => onRemove(field.id)} className="text-gray-300 hover:text-red-400 transition-colors text-sm">✕</button>
    </div>
  );
}

export default function FormEditBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: formData, isLoading } = useForm(id);
  const updateForm = useUpdateForm();

  const [title, setTitle] = useState('');
  const [fields, setFields] = useState<FormField[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (formData) {
      setTitle(formData.title);
      setFields(formData.fields as FormField[]);
    }
  }, [formData]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const addField = useCallback((type: FieldType) => {
    const fid = Math.random().toString(36).slice(2);
    setFields((prev) => [...prev, { id: fid, type, label: '', required: false, order: prev.length }]);
  }, []);

  const updateField = useCallback((updated: FormField) => {
    setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }, []);

  const removeField = useCallback((fid: string) => {
    setFields((prev) => prev.filter((f) => f.id !== fid));
  }, []);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFields((prev) => {
        const oldIndex = prev.findIndex((f) => f.id === active.id);
        const newIndex = prev.findIndex((f) => f.id === over.id);
        return arrayMove(prev, oldIndex, newIndex).map((f, i) => ({ ...f, order: i }));
      });
    }
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await updateForm.mutateAsync({ id, title, fields });
      router.push('/forms');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <div className="h-64 bg-gray-100 animate-pulse rounded-xl" />;
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-mono text-purple-400 tracking-widest uppercase mb-1">Form Builder</p>
        <h1 className="font-display text-2xl font-bold text-gray-900">แก้ไขแบบฟอร์ม</h1>
      </div>
      <div className="flex gap-6">
        <div className="w-52 shrink-0">
          <p className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">ประเภทฟิลด์</p>
          <div className="space-y-1.5">
            {FIELD_TYPES.map((ft) => (
              <button key={ft.type} onClick={() => addField(ft.type)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-purple-400 hover:text-purple-600 transition-colors">
                <span>{ft.icon}</span><span>{ft.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="ชื่อแบบฟอร์ม..."
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-lg font-semibold mb-4 focus:outline-none focus:border-purple-400" />
          {fields.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-gray-400">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-sm">คลิกประเภทฟิลด์ทางซ้ายเพื่อเพิ่ม</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {fields.map((field) => (
                    <SortableField key={field.id} field={field} onUpdate={updateField} onRemove={removeField} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
          <div className="mt-4 flex justify-end gap-3">
            <button onClick={() => router.push('/forms')} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">ยกเลิก</button>
            <button
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
              onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/(app)/forms/
git commit -m "feat: form builder saves to API, add edit route /forms/[id]/builder"
```

---

## Self-Review

**Spec coverage check:**
- ✅ React Query providers → Task 1
- ✅ Dashboard stats wired to API → Task 3
- ✅ Patients list with search → Task 4
- ✅ Patient detail + timeline → Task 5
- ✅ Events calendar with FullCalendar → Task 6
- ✅ Forms list real data → Task 7
- ✅ Form builder saves via POST /forms → Task 8
- ✅ Form edit at /forms/[id]/builder → Task 8

**Not in this plan:**
- `proxy.ts` (Next.js 16 network boundary) — low priority, doesn't block functionality
- Cache Components + PPR — performance optimisation, not a correctness gap
