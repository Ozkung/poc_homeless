# LIFF Register / Profile Smart Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/register` route to the LIFF app that checks profile completeness and shows a form to collect missing phone + birthDate; redirect to ProfilePage when already complete.

**Architecture:** Guard pattern in RegisterPage — on mount it calls `GET /auth/me`, checks `phone && birthDate`, redirects to `/profile` if complete. Backend `getMe` and `updateMe` gain `birthDate` support. Email is shown read-only (always present in DB); only phone, birthDate, gender are sent via PATCH.

**Tech Stack:** NestJS (backend), React 19 + React Router DOM v7 + TypeScript + Vite (LIFF frontend), Prisma, class-validator

---

## File Map

| File | Action |
|---|---|
| `apps/backend/src/modules/auth/dto/update-me.dto.ts` | Add `birthDate` field |
| `apps/backend/src/modules/auth/auth.service.ts` | Add `birthDate` to `getMe` select + `updateMe` handler |
| `apps/liff/src/lib/api.ts` | Add `getMe()` and `updateMe()` |
| `apps/liff/src/pages/RegisterPage.tsx` | **Create** — completeness guard + form |
| `apps/liff/src/main.tsx` | Add `/register` route |

---

### Task 1: Backend — add birthDate support to getMe and updateMe

**Files:**
- Modify: `apps/backend/src/modules/auth/dto/update-me.dto.ts`
- Modify: `apps/backend/src/modules/auth/auth.service.ts`

- [ ] **Step 1: Add `birthDate` to UpdateMeDto**

Replace the full contents of `apps/backend/src/modules/auth/dto/update-me.dto.ts` with:

```ts
import { IsDateString, IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { Gender } from '@prisma/client';

export class UpdateMeDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() currentPassword?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsDateString() birthDate?: string;
}
```

- [ ] **Step 2: Add `birthDate` to `getMe` select in auth.service.ts**

In `apps/backend/src/modules/auth/auth.service.ts`, find the `getMe` method (around line 207). The current select is:
```ts
select: {
  id: true, email: true, displayName: true, role: true,
  phone: true, gender: true, avatarUrl: true,
  lineUserId: true, isActive: true, createdAt: true,
},
```

Add `birthDate: true` to the select:
```ts
select: {
  id: true, email: true, displayName: true, role: true,
  phone: true, gender: true, avatarUrl: true,
  lineUserId: true, isActive: true, createdAt: true,
  birthDate: true,
},
```

- [ ] **Step 3: Handle `birthDate` in `updateMe`**

In `apps/backend/src/modules/auth/auth.service.ts`, find the `updateMe` method (around line 220). The current destructuring is:
```ts
const { email, currentPassword, ...rest } = dto;
const updateData: Record<string, unknown> = { ...rest };
```

The `...rest` spread already includes `birthDate` as a string, but Prisma expects a `Date` object. Replace those two lines with:

```ts
const { email, currentPassword, birthDate, ...rest } = dto;
const updateData: Record<string, unknown> = { ...rest };
if (birthDate !== undefined) {
  updateData.birthDate = birthDate ? new Date(birthDate) : null;
}
```

Also add `birthDate: true` to the `select` in the `prisma.user.update` call at the end of `updateMe` (around line 237):
```ts
select: { id: true, email: true, displayName: true, phone: true, gender: true, avatarUrl: true, role: true, birthDate: true },
```

- [ ] **Step 4: Build backend to verify no TypeScript errors**

```bash
cd apps/backend && npx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 5: Commit backend changes**

```bash
git add apps/backend/src/modules/auth/dto/update-me.dto.ts apps/backend/src/modules/auth/auth.service.ts
git commit -m "feat(backend): add birthDate support to getMe and updateMe"
```

---

### Task 2: LIFF — add getMe and updateMe to api.ts

**Files:**
- Modify: `apps/liff/src/lib/api.ts`

- [ ] **Step 1: Add `getMe` and `updateMe` to the api object**

In `apps/liff/src/lib/api.ts`, find the closing `};` of the `api` object (line 74). Add before it:

```ts
  getMe: () =>
    request<{
      id: string;
      email: string;
      displayName?: string;
      phone?: string | null;
      birthDate?: string | null;
      gender?: string | null;
      role: string;
    }>('/auth/me'),

  updateMe: (data: { phone?: string; birthDate?: string; gender?: string }) =>
    request<{ id: string; email: string; phone?: string; birthDate?: string; gender?: string }>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
```

Note: `email` is intentionally excluded from `updateMe` params — changing email requires `currentPassword` which is handled by a separate web app flow, not LIFF.

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/liff && npx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add apps/liff/src/lib/api.ts
git commit -m "feat(liff): add getMe and updateMe to api client"
```

---

### Task 3: Create RegisterPage.tsx

**Files:**
- Create: `apps/liff/src/pages/RegisterPage.tsx`

- [ ] **Step 1: Create the file with full implementation**

Create `apps/liff/src/pages/RegisterPage.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { api, getToken } from '../lib/api';

type Step = 'loading' | 'form' | 'submitting';

interface Me {
  email: string;
  phone?: string | null;
  birthDate?: string | null;
  gender?: string | null;
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
  borderRadius: 8, fontSize: 15, boxSizing: 'border-box' as const, marginTop: 4, background: '#fff',
};
const lbl: React.CSSProperties = { fontSize: 12, color: '#6b7280', fontWeight: 600 };
const btn = (primary = true): React.CSSProperties => ({
  width: '100%', padding: 12, borderRadius: 10, border: 'none',
  background: primary ? '#7c3aed' : '#f3f4f6',
  color: primary ? '#fff' : '#374151',
  fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 8,
});

function isComplete(me: Me): boolean {
  return !!me.phone && !!me.birthDate && !!me.email;
}

function toDateInput(iso?: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

const wrap = (children: React.ReactNode) => (
  <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, paddingTop: 0 }}>
    <div style={{ width: '100%', maxWidth: 400 }}>{children}</div>
  </div>
);

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('loading');
  const [lineProfile, setLineProfile] = useState<{ displayName: string; pictureUrl?: string } | null>(null);
  const [form, setForm] = useState({ phone: '', birthDate: '', gender: '' });
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!getToken()) {
      navigate('/welcome', { replace: true });
      return;
    }
    async function load() {
      try {
        const [me, profile] = await Promise.all([
          api.getMe(),
          liff.getProfile().catch(() => null),
        ]);
        if (profile) setLineProfile({ displayName: profile.displayName, pictureUrl: profile.pictureUrl ?? undefined });
        setEmail(me.email);
        if (isComplete(me)) {
          navigate('/profile', { replace: true });
          return;
        }
        setForm({
          phone: me.phone ?? '',
          birthDate: toDateInput(me.birthDate),
          gender: me.gender ?? '',
        });
        setStep('form');
      } catch {
        setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่');
        setStep('form');
      }
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.phone.trim()) { setError('กรุณาระบุเบอร์โทรศัพท์'); return; }
    if (!form.birthDate) { setError('กรุณาระบุวันเกิด'); return; }
    setError('');
    setStep('submitting');
    try {
      await api.updateMe({
        phone: form.phone.trim(),
        birthDate: form.birthDate,
        gender: form.gender || undefined,
      });
      navigate('/profile', { replace: true });
    } catch (err: any) {
      setError(err.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      setStep('form');
    }
  }

  if (step === 'loading') return wrap(
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p style={{ color: '#9ca3af', fontSize: 13, fontFamily: 'monospace' }}>กำลังโหลด...</p>
    </div>
  );

  const today = new Date().toISOString().slice(0, 10);

  return wrap(
    <>
      {/* Purple gradient header */}
      <div style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', padding: '20px 20px 18px', borderRadius: '0 0 24px 24px', marginBottom: 20 }}>
        <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: 'monospace', margin: '0 0 8px' }}>HomeMed Connect</p>

        {/* LINE profile row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '8px 12px', marginBottom: 12 }}>
          {lineProfile?.pictureUrl ? (
            <img src={lineProfile.pictureUrl} alt="LINE" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.4)', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#06c755', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 16, flexShrink: 0 }}>
              {lineProfile?.displayName?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{lineProfile?.displayName ?? '...'}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>LINE Account เชื่อมต่อแล้ว ✓</div>
          </div>
        </div>

        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>ข้อมูลส่วนตัว</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>กรอกให้ครบก่อนเริ่มใช้งาน</div>
      </div>

      {/* Form */}
      <div style={{ padding: '0 16px 32px' }}>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Email read-only */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>อีเมล</label>
            <div style={{ ...inp, background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb', cursor: 'not-allowed' }}>
              {email}
            </div>
            <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>ไม่สามารถแก้ไขอีเมลได้ที่นี่</p>
          </div>

          {/* Phone */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>เบอร์โทรศัพท์ *</label>
            <input
              style={inp}
              type="tel"
              placeholder="08x-xxx-xxxx"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          {/* BirthDate */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>วันเกิด *</label>
            <input
              style={inp}
              type="date"
              max={today}
              value={form.birthDate}
              onChange={e => setForm({ ...form, birthDate: e.target.value })}
            />
          </div>

          {/* Gender chips */}
          <div style={{ marginBottom: 24 }}>
            <label style={lbl}>เพศ</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {(['MALE', 'FEMALE', 'OTHER'] as const).map((g) => {
                const label = g === 'MALE' ? 'ชาย' : g === 'FEMALE' ? 'หญิง' : 'อื่นๆ';
                const selected = form.gender === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setForm({ ...form, gender: selected ? '' : g })}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 10, border: '1.5px solid',
                      borderColor: selected ? '#7c3aed' : '#e2e8f0',
                      background: selected ? '#7c3aed' : '#fff',
                      color: selected ? '#fff' : '#374151',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <button type="submit" style={btn(true)} disabled={step === 'submitting'}>
            {step === 'submitting' ? 'กำลังบันทึก...' : 'บันทึกและเริ่มใช้งาน →'}
          </button>
        </form>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/liff && npx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add apps/liff/src/pages/RegisterPage.tsx
git commit -m "feat(liff): add RegisterPage with profile completeness guard"
```

---

### Task 4: Add /register route to main.tsx

**Files:**
- Modify: `apps/liff/src/main.tsx`

- [ ] **Step 1: Add import**

In `apps/liff/src/main.tsx`, after the existing page imports (around line 14), add:

```tsx
import RegisterPage from './pages/RegisterPage';
```

- [ ] **Step 2: Add the route**

In the `<Routes>` block in `main.tsx`, add after the `/welcome` route:

```tsx
<Route path="/register" element={<RegisterPage />} />
```

The full Routes block should look like:
```tsx
<Routes>
  <Route path="/" element={<TaskPage />} />
  <Route path="/auth" element={<AuthPage />} />
  <Route path="/welcome" element={<WelcomePage />} />
  <Route path="/register" element={<RegisterPage />} />
  <Route path="/checkin/:taskId" element={<CheckinPage />} />
  <Route path="/form/:taskId/:formId" element={<FormPage />} />
  <Route path="/note/:taskId" element={<NotePage />} />
  <Route path="/care-plan/:patientId" element={<CarePlanPage />} />
  <Route path="/profile" element={<ProfilePage />} />
  <Route path="/add-patient" element={<AddPatientPage />} />
</Routes>
```

- [ ] **Step 3: Verify TypeScript and build**

```bash
cd apps/liff && npx tsc --noEmit && npm run build
```

Expected: zero TypeScript errors, build succeeds

- [ ] **Step 4: Commit**

```bash
git add apps/liff/src/main.tsx
git commit -m "feat(liff): add /register route for profile completion flow"
```

---

## Manual Verification Checklist

**Flow A — Incomplete profile (no phone/birthDate):**
1. Open LIFF at `/liff/register` → loading spinner briefly → RegisterPage form appears
2. Header shows LINE profile pic + display name + "ข้อมูลส่วนตัว"
3. Email shows read-only with "ไม่สามารถแก้ไขอีเมลได้ที่นี่"
4. Phone and birthDate fields are empty
5. Submit with empty phone → error "กรุณาระบุเบอร์โทรศัพท์"
6. Fill phone + birthDate → submit → navigate to `/profile`

**Flow B — Complete profile:**
1. Open LIFF at `/liff/register` → loading → immediately redirected to `/profile`
2. User never sees the form

**Flow C — No token (unlinked):**
1. Open LIFF at `/liff/register` without being linked → redirected to `/welcome`
