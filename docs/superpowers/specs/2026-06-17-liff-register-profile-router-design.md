# LIFF Register / Profile Smart Router — Design Spec

**Date:** 2026-06-17

## Overview

Sub-project 1 of 4 Rich Menu pages. When user taps the "สมัครสมาชิก" Rich Menu button, the LIFF app opens at `/register`. The page checks whether the user's profile is complete (phone + birthDate + email all filled). If incomplete → show RegisterPage form. If complete → redirect to ProfilePage.

---

## User Stories

- As a new GUEST user who just registered via WelcomePage (has email but no phone/birthDate), I open "สมัครสมาชิก" and see a form to complete my profile.
- As a returning user with a complete profile, I open "สมัครสมาชิก" and am immediately taken to my ProfilePage without filling anything.

---

## Flow

```
Rich Menu "สมัครสมาชิก" → /liff/register
  → RegisterPage mount → GET /auth/me
    → phone && birthDate && email all non-null → navigate('/profile', { replace: true })
    → any field missing → show form (pre-filled with existing values)
  → user submits form → PATCH /auth/me → navigate('/profile', { replace: true })
```

**Note:** `main.tsx` init flow is unchanged. Unlinked users still go to `/welcome` (WelcomePage). RegisterPage is only for users who are already linked to a system account but haven't completed their profile.

If a non-authenticated user (no token) navigates to `/register`, they are redirected to `/welcome`.

---

## Architecture

### Files Changed

| File | Action | Responsibility |
|---|---|---|
| `apps/liff/src/pages/RegisterPage.tsx` | **Create** | Profile completeness guard + form |
| `apps/liff/src/main.tsx` | **Modify** | Add `/register` route |
| `apps/liff/src/lib/api.ts` | **Modify** | Add `getMe()` and `updateMe()` |
| `apps/backend/src/modules/auth/dto/update-me.dto.ts` | **Modify** | Add `birthDate` field |
| `apps/backend/src/modules/auth/auth.service.ts` | **Modify** | Save `birthDate` in `updateMe()` |

---

## Section 1: RegisterPage.tsx (New)

**File:** `apps/liff/src/pages/RegisterPage.tsx`

### State Machine

```
[loading]  → GET /auth/me
  → complete  → navigate('/profile', { replace: true })  [terminal]
  → incomplete → [form]
  → no token  → navigate('/welcome', { replace: true })  [terminal]

[form]     → user fills fields → submit
  → PATCH /auth/me success → navigate('/profile', { replace: true })  [terminal]
  → PATCH /auth/me error   → inline error, stay on [form]
```

### Header (shown during form step)

- LINE profile picture from `liff.getProfile()` (64×64, circle, fallback initial)
- LINE display name
- Subtitle: "กรอกข้อมูลให้ครบก่อนเริ่มใช้งาน"

### Form Fields

Pre-filled from `GET /auth/me` response:

| Field | Type | Required | Validation |
|---|---|---|---|
| อีเมล | `type="email"` | ✅ | valid email |
| เบอร์โทรศัพท์ | `type="tel"` | ✅ | non-empty |
| วันเกิด | `type="date"` | ✅ | max = today |
| เพศ | radio chips: ชาย / หญิง / อื่นๆ | ❌ | — |

### Submit Button

"บันทึกและเริ่มใช้งาน →" — disabled while `submitting`

### Completeness Check Logic

```ts
const isComplete = (me: { phone?: string; birthDate?: string; email: string }) =>
  !!me.phone && !!me.birthDate && !!me.email;
```

`birthDate` from the API is an ISO string (`"2000-01-01T00:00:00.000Z"`). For the `type="date"` input, convert to `"YYYY-MM-DD"` format on pre-fill:
```ts
const toDateInput = (iso?: string) =>
  iso ? iso.slice(0, 10) : '';
```

---

## Section 2: main.tsx Changes

Add import and route:

```tsx
import RegisterPage from './pages/RegisterPage';

// Inside <Routes>:
<Route path="/register" element={<RegisterPage />} />
```

No other changes to `main.tsx`. The `/register` route renders without waiting for `ready` state (RegisterPage handles its own auth check via `getToken()`).

Wait — RegisterPage needs `ready` to be true (i.e., user is logged in) before it can call `GET /auth/me`. Since `main.tsx` sets `ready = true` after `verifyLiff` succeeds, `/register` must live inside the `if (ready)` render block, same as other routes.

The init flow in `main.tsx` already handles: linked → `setReady(true)` → routes render. So RegisterPage will only render after LINE login + verifyLiff succeed, which is correct.

---

## Section 3: api.ts Changes

Add two functions to the `api` object in `apps/liff/src/lib/api.ts`:

```ts
getMe: () =>
  request<{
    id: string;
    email: string;
    displayName?: string;
    phone?: string;
    birthDate?: string;
    gender?: string;
    role: string;
  }>('/auth/me'),

updateMe: (data: {
  email?: string;
  phone?: string;
  birthDate?: string;
  gender?: string;
}) =>
  request('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
```

---

## Section 4: Backend Changes

### `update-me.dto.ts`

Add to `UpdateMeDto`:

```ts
@IsOptional() @IsDateString() birthDate?: string;
```

Import `IsDateString` from `class-validator`.

### `auth.service.ts` → `updateMe()`

In the `updateMe` method, after existing field assignments, add:

```ts
if (dto.birthDate !== undefined) {
  data.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
}
```

### `GET /auth/me` Response

The endpoint already exists at `GET /auth/me` with `@UseGuards(JwtAuthGuard)`. Ensure the Prisma select in `auth.service.ts` → `getMe()` (or equivalent) includes these fields:
```ts
select: {
  id: true, email: true, displayName: true,
  phone: true, birthDate: true, gender: true, role: true,
  // ... other existing fields
}
```
If the service returns the full Prisma object (no explicit select), these fields are already included automatically.

---

## Error / Edge Cases

| Case | Behavior |
|---|---|
| No token (unlinked) | `getToken()` returns null → `navigate('/welcome', { replace: true })` |
| `GET /auth/me` fails (network) | Show error screen with retry button |
| Profile already complete | Auto-redirect to `/profile` on mount, user never sees the form |
| Submit with empty required field | Inline validation error, no API call |
| `PATCH /auth/me` fails | Inline error message, stay on form |
| User navigates back to `/register` after completing | Immediate redirect to `/profile` |

---

## Out of Scope

- Password change (handled by ProfilePage separately)
- Zone change (set during WelcomePage, not changeable here)
- Role change (never allowed from LIFF)
- Avatar/photo upload
- Changes to WelcomePage, AuthPage, or TaskPage
