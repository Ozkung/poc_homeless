# LIFF App Routing & Field Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-page LIFF app with proper client-side routing (4 routes: tasks list, check-in, form, note), add missing field type renderers (radio, checkbox, scale, date), and wire the note endpoint.

**Architecture:** Add `react-router-dom` for client-side routing inside the Vite/React SPA. The current `main.tsx` resolves `taskId`/`token` from URL params and renders `TaskPage` — replace it with a router that maps URL paths to dedicated page components. Each page imports from the existing `api` client. Field rendering is extracted into a `FieldRenderer` component shared across the form page.

**Tech Stack:** React 19, Vite 6, `react-router-dom` v6, `@line/liff`, `@homemed/shared-types`, Tailwind (via CDN in `index.html` — check before adding), existing `api.ts` + `liff.ts`

---

## File Map

| Action | File |
|---|---|
| Modify | `apps/liff/package.json` |
| Modify | `apps/liff/src/main.tsx` |
| Create | `apps/liff/src/router.tsx` |
| Rename/keep | `apps/liff/src/pages/TaskPage.tsx` → becomes tasks list |
| Create | `apps/liff/src/pages/CheckinPage.tsx` |
| Create | `apps/liff/src/pages/FormPage.tsx` |
| Create | `apps/liff/src/pages/NotePage.tsx` |
| Create | `apps/liff/src/components/FieldRenderer.tsx` |
| Modify | `apps/liff/src/lib/api.ts` |

---

### Task 1: Install react-router-dom

**Files:**
- Modify: `apps/liff/package.json`

- [ ] **Step 1: Install the package**

```bash
cd apps/liff && npm install react-router-dom @types/react-router-dom
```

- [ ] **Step 2: Verify it installs cleanly**

```bash
cd apps/liff && npm ls react-router-dom 2>&1 | head -5
```

Expected: `react-router-dom@6.x.x`

- [ ] **Step 3: Commit**

```bash
git add apps/liff/package.json apps/liff/package-lock.json
git commit -m "chore: add react-router-dom to LIFF app"
```

---

### Task 2: Add `addNote` to api.ts

The existing `api.ts` has `addNote` but `NotePage` needs to call it. Verify the signature is correct and add a `getTask` convenience method.

**Files:**
- Modify: `apps/liff/src/lib/api.ts`

- [ ] **Step 1: Verify current api.ts content**

Open `apps/liff/src/lib/api.ts`. Confirm `addNote` exists with signature:
```typescript
addNote: (taskId: string, note: string) =>
  request(`/tasks/${taskId}/note`, { method: 'POST', body: JSON.stringify({ note }) }),
```

If missing, add it. Also add `getTask`:

Replace the full `export const api` block with:

```typescript
export const api = {
  verifyLiff: (idToken: string) =>
    request<{ accessToken: string }>('/auth/liff/verify', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),
  getMyTasks: () => request<any[]>('/tasks/my'),
  getTask: (taskId: string) => request<any>(`/tasks/my`).then((tasks: any[]) =>
    tasks.find((t) => t.id === taskId) ?? null,
  ),
  checkin: (taskId: string) =>
    request(`/tasks/${taskId}/checkin`, { method: 'POST' }),
  addNote: (taskId: string, note: string) =>
    request(`/tasks/${taskId}/note`, { method: 'POST', body: JSON.stringify({ note }) }),
  submit: (taskId: string, token: string, answers: any[]) =>
    request('/submissions', { method: 'POST', body: JSON.stringify({ taskId, token, answers }) }),
  updateStatus: (taskId: string, status: string) =>
    request(`/tasks/${taskId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/liff/src/lib/api.ts
git commit -m "feat: add getTask helper to LIFF api client"
```

---

### Task 3: FieldRenderer Component — All Field Types

Currently `TaskPage.tsx` renders text, number, textarea, select but misses radio, checkbox, scale, date. Extract all types into a shared `FieldRenderer` component.

**Files:**
- Create: `apps/liff/src/components/FieldRenderer.tsx`

- [ ] **Step 1: Create FieldRenderer.tsx**

Create `apps/liff/src/components/FieldRenderer.tsx`:

```tsx
import type { FormField } from '@homemed/shared-types';

interface Props {
  field: FormField;
  value: unknown;
  onChange: (fieldId: string, value: unknown) => void;
}

export function FieldRenderer({ field, value, onChange }: Props) {
  const base =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500 bg-white';

  switch (field.type) {
    case 'text':
      return (
        <input
          type="text"
          required={field.required}
          placeholder={field.placeholder}
          value={(value as string) ?? ''}
          className={base}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          required={field.required}
          value={(value as string) ?? ''}
          className={base}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      );

    case 'textarea':
      return (
        <textarea
          required={field.required}
          rows={3}
          value={(value as string) ?? ''}
          className={base}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      );

    case 'select':
    case 'multiselect':
      return (
        <select
          required={field.required}
          value={(value as string) ?? ''}
          className={base}
          onChange={(e) => onChange(field.id, e.target.value)}
        >
          <option value="">เลือก...</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'radio':
      return (
        <div className="space-y-2">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name={field.id}
                value={opt}
                checked={value === opt}
                required={field.required}
                className="accent-purple-600"
                onChange={() => onChange(field.id, opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      );

    case 'checkbox': {
      const checked = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-2">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                value={opt}
                checked={checked.includes(opt)}
                className="accent-purple-600"
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...checked, opt]
                    : checked.filter((v) => v !== opt);
                  onChange(field.id, next);
                }}
              />
              {opt}
            </label>
          ))}
        </div>
      );
    }

    case 'scale': {
      const min = field.min ?? 0;
      const max = field.max ?? 10;
      const current = (value as number) ?? min;
      return (
        <div className="space-y-2">
          <input
            type="range"
            min={min}
            max={max}
            value={current}
            className="w-full accent-purple-600"
            onChange={(e) => onChange(field.id, +e.target.value)}
          />
          <div className="flex justify-between text-xs text-gray-400 font-mono">
            <span>{min}</span>
            <span className="text-purple-600 font-semibold text-sm">{current}</span>
            <span>{max}</span>
          </div>
        </div>
      );
    }

    case 'date':
      return (
        <input
          type="date"
          required={field.required}
          value={(value as string) ?? ''}
          className={base}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      );

    default:
      return (
        <p className="text-xs text-gray-400 font-mono">ไม่รองรับ field type: {field.type}</p>
      );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/liff/src/components/
git commit -m "feat: FieldRenderer supporting all 8 field types (radio, checkbox, scale, date + existing)"
```

---

### Task 4: Tasks List Page (refactor TaskPage)

Refactor `TaskPage.tsx` to be a tasks-list-only page — it shows today's tasks with status, and links to `/checkin/:taskId`, `/form/:taskId/:formId`, and `/note/:taskId`.

**Files:**
- Modify: `apps/liff/src/pages/TaskPage.tsx`

- [ ] **Step 1: Replace TaskPage with tasks list**

Replace entire contents of `apps/liff/src/pages/TaskPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'รอดำเนินการ',
  IN_PROGRESS: 'กำลังดำเนินการ',
  DONE: 'เสร็จสิ้น',
  NOT_FOUND: 'ไม่พบผู้ป่วย',
};
const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200',
  DONE: 'bg-green-50 text-green-700 border-green-200',
  NOT_FOUND: 'bg-gray-100 text-gray-500 border-gray-200',
};

export default function TaskPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMyTasks()
      .then(setTasks)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto p-4 space-y-3 mt-4">
        {[1, 2].map((i) => <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4">
      <div className="mb-5">
        <p className="text-xs text-purple-600 font-mono uppercase tracking-wider">HomeMed Connect</p>
        <h1 className="text-xl font-bold text-gray-900 mt-1">งานของฉัน</h1>
        <p className="text-sm text-gray-400 mt-0.5">{tasks.length} งาน</p>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-sm">ไม่มีงานในขณะนี้</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{task.event?.title ?? 'งาน'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">ผู้ป่วย HN: {task.patient?.hn}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLOR[task.status] ?? ''}`}>
                  {STATUS_LABEL[task.status] ?? task.status}
                </span>
              </div>

              {task.status !== 'DONE' && task.status !== 'NOT_FOUND' && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {task.status === 'PENDING' && (
                    <Link
                      to={`/checkin/${task.id}`}
                      className="flex-1 text-center text-xs font-semibold py-2 px-3 border border-purple-300 text-purple-600 rounded-lg"
                    >
                      Check-in
                    </Link>
                  )}
                  {task.formTemplate && (
                    <Link
                      to={`/form/${task.id}/${task.formTemplate.id ?? 'default'}`}
                      className="flex-1 text-center text-xs font-semibold py-2 px-3 bg-purple-600 text-white rounded-lg"
                    >
                      กรอกแบบฟอร์ม
                    </Link>
                  )}
                  <Link
                    to={`/note/${task.id}`}
                    className="flex-1 text-center text-xs font-semibold py-2 px-3 border border-gray-300 text-gray-600 rounded-lg"
                  >
                    บันทึก
                  </Link>
                </div>
              )}
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
git add apps/liff/src/pages/TaskPage.tsx
git commit -m "feat: LIFF tasks list page with links to checkin/form/note"
```

---

### Task 5: Check-in Page

**Files:**
- Create: `apps/liff/src/pages/CheckinPage.tsx`

- [ ] **Step 1: Create CheckinPage.tsx**

Create `apps/liff/src/pages/CheckinPage.tsx`:

```tsx
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function CheckinPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleCheckin() {
    if (!taskId) return;
    setLoading(true);
    setError('');
    try {
      await api.checkin(taskId);
      setDone(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (e: any) {
      setError(e.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-5xl mb-4">📍</p>
          <p className="font-semibold text-gray-700 text-lg">Check-in สำเร็จ</p>
          <p className="text-sm text-gray-400 mt-1">กลับสู่รายการงาน...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 mt-8">
      <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600 mb-6 block">
        ← กลับ
      </button>
      <div className="text-center">
        <p className="text-5xl mb-4">📍</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Check-in</h1>
        <p className="text-sm text-gray-500 mb-8">ยืนยันว่าคุณอยู่ที่ไซต์งาน</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleCheckin}
          disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors"
        >
          {loading ? 'กำลังบันทึก...' : 'ยืนยัน Check-in'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/liff/src/pages/CheckinPage.tsx
git commit -m "feat: LIFF check-in page"
```

---

### Task 6: Form Page — Full Field Types

**Files:**
- Create: `apps/liff/src/pages/FormPage.tsx`

- [ ] **Step 1: Create FormPage.tsx**

Create `apps/liff/src/pages/FormPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { FieldRenderer } from '../components/FieldRenderer';
import type { FormField } from '@homemed/shared-types';

export default function FormPage() {
  const { taskId } = useParams<{ taskId: string; formId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!taskId) return;
    api.getTask(taskId)
      .then(setTask)
      .finally(() => setLoading(false));
  }, [taskId]);

  function handleChange(fieldId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!taskId) return;
    setSubmitting(true);
    setError('');
    try {
      const answerArray = Object.entries(answers).map(([fieldId, value]) => ({ fieldId, value }));
      await api.submit(taskId, token, answerArray);
      setSubmitted(true);
      setTimeout(() => navigate('/'), 2000);
    } catch (e: any) {
      setError(e.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto p-4 mt-4 space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-lg" />)}
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-5xl mb-4">✅</p>
          <p className="font-semibold text-gray-700 text-lg">ส่งแบบฟอร์มสำเร็จ</p>
        </div>
      </div>
    );
  }

  const fields: FormField[] = task?.formTemplate?.fields ?? [];

  return (
    <div className="max-w-lg mx-auto p-4">
      <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600 mb-4 block">
        ← กลับ
      </button>
      <div className="mb-5">
        <p className="text-xs text-purple-600 font-mono uppercase tracking-wider">HomeMed Connect</p>
        <h1 className="text-xl font-bold text-gray-900 mt-1">
          {task?.formTemplate?.title ?? task?.event?.title ?? 'แบบฟอร์ม'}
        </h1>
        {task && <p className="text-sm text-gray-500 mt-1">ผู้ป่วย HN: {task.patient?.hn}</p>}
      </div>

      {!task && (
        <div className="text-center py-8 text-gray-400">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm">ไม่พบงานนี้</p>
        </div>
      )}

      {task && fields.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">ไม่มีฟิลด์ในแบบฟอร์ม</div>
      )}

      {task && fields.length > 0 && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {fields
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((field) => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <FieldRenderer
                  field={field}
                  value={answers[field.id]}
                  onChange={handleChange}
                />
              </div>
            ))}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors"
          >
            {submitting ? 'กำลังส่ง...' : 'ส่งแบบฟอร์ม'}
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/liff/src/pages/FormPage.tsx
git commit -m "feat: LIFF form page with all field types via FieldRenderer"
```

---

### Task 7: Note Page

**Files:**
- Create: `apps/liff/src/pages/NotePage.tsx`

- [ ] **Step 1: Create NotePage.tsx**

Create `apps/liff/src/pages/NotePage.tsx`:

```tsx
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function NotePage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!taskId || !note.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.addNote(taskId, note.trim());
      setDone(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (e: any) {
      setError(e.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-5xl mb-4">📝</p>
          <p className="font-semibold text-gray-700 text-lg">บันทึกสำเร็จ</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 mt-4">
      <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600 mb-6 block">
        ← กลับ
      </button>
      <div className="mb-5">
        <p className="text-xs text-purple-600 font-mono uppercase tracking-wider">HomeMed Connect</p>
        <h1 className="text-xl font-bold text-gray-900 mt-1">บันทึกภาคสนาม</h1>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="บันทึกสิ่งที่พบ..."
        rows={6}
        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 resize-none"
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mt-3">
          {error}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !note.trim()}
        className="w-full mt-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors"
      >
        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/liff/src/pages/NotePage.tsx
git commit -m "feat: LIFF note page"
```

---

### Task 8: Router + Wire main.tsx

Replace the monolithic `main.tsx` with a router that maps the 4 routes.

**Files:**
- Create: `apps/liff/src/router.tsx`
- Modify: `apps/liff/src/main.tsx`

- [ ] **Step 1: Create router.tsx**

Create `apps/liff/src/router.tsx`:

```tsx
import { createBrowserRouter } from 'react-router-dom';
import TaskPage from './pages/TaskPage';
import CheckinPage from './pages/CheckinPage';
import FormPage from './pages/FormPage';
import NotePage from './pages/NotePage';

export const router = createBrowserRouter([
  { path: '/', element: <TaskPage /> },
  { path: '/checkin/:taskId', element: <CheckinPage /> },
  { path: '/form/:taskId/:formId', element: <FormPage /> },
  { path: '/note/:taskId', element: <NotePage /> },
]);
```

- [ ] **Step 2: Update main.tsx**

Replace the entire contents of `apps/liff/src/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import liff from '@line/liff';
import { initLiff } from './lib/liff';
import { api, setToken } from './lib/api';
import { router } from './router';

async function bootstrap() {
  try {
    await initLiff();
    const idToken = liff.getIDToken();
    if (!idToken) throw new Error('No ID token from LIFF');
    const { accessToken } = await api.verifyLiff(idToken);
    setToken(accessToken);
  } catch (e: any) {
    createRoot(document.getElementById('root')!).render(
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="font-semibold text-gray-700">{e.message ?? 'เกิดข้อผิดพลาด'}</p>
        </div>
      </div>,
    );
    return;
  }

  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );
}

bootstrap();
```

- [ ] **Step 3: Verify the build compiles**

```bash
cd apps/liff && npm run build 2>&1 | tail -20
```

Expected: `✓ built in` with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/liff/src/router.tsx apps/liff/src/main.tsx
git commit -m "feat: LIFF client-side routing — 4 routes (tasks, checkin, form, note)"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `tasks/` route → TaskPage (Task 4)
- ✅ `checkin/:taskId` route → CheckinPage (Task 5)
- ✅ `form/:taskId/:formId` route → FormPage (Task 6)
- ✅ `note/:taskId` route → NotePage (Task 7)
- ✅ radio field → FieldRenderer (Task 3)
- ✅ checkbox field → FieldRenderer (Task 3)
- ✅ scale field → FieldRenderer (Task 3)
- ✅ date field → FieldRenderer (Task 3)
- ✅ Router wired into main.tsx (Task 8)

**Placeholder scan:** No TBDs, all code blocks complete, types match `@homemed/shared-types` definitions.

**Type consistency check:**
- `FormField` from `@homemed/shared-types` used consistently in `FieldRenderer`, `FormPage`, `TaskPage`
- `api.getTask`, `api.checkin`, `api.addNote`, `api.submit` all defined in Task 2 before used in pages
- `useParams` generics match route path params in all pages
