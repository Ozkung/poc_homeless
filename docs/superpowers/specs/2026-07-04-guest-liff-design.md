# Guest LIFF Design

**Date:** 2026-07-04  
**Status:** Approved  
**Domain:** `https://line5566.duckdns.org/liff`

---

## Overview

A LINE LIFF app (`apps/liff`) for **GUEST** role users — community members and volunteers who self-register via LINE, pick a preferred zone, view upcoming doctor field visits, and report homeless persons they find. The app is mobile-first, runs inside LINE's in-app browser, and authenticates exclusively via LINE ID token.

---

## Architecture

### Stack
- **Framework:** Vite + React 19 + TypeScript
- **Routing:** `react-router-dom` v7 with `basename="/liff"`
- **State:** Zustand (`profileStore`)
- **LINE SDK:** `@line/liff` v2
- **Styling:** Inline styles (matches existing LIFF design system, `#6366F1` accent)
- **No UI framework** — keeps bundle small for LINE's in-app browser

### Deployment
- Served as a static build by nginx on path `/liff`
- nginx already configured: `location /liff → liff:80`
- docker-compose already has `liff` service slot
- No new containers or nginx changes required

### File structure (within `apps/liff/src/`)
```
main.tsx              — LIFF init, auth routing, app shell
lib/liff.ts           — initLiff(), liffLogin()
lib/api.ts            — typed API client (Bearer token)
store/profileStore.ts — Zustand: lineProfile, systemProfile, zones
pages/
  HomePage.tsx        — main dashboard (schedule + actions)
  RegisterPage.tsx    — self-registration form
  ProfilePage.tsx     — edit profile
  ReportPage.tsx      — report a found patient
```

---

## Auth Flow

```
LINE opens LIFF
  → liff.init() → liff.login() if not authenticated
  → liff.getIDToken()
  → POST /auth/liff/verify
      200 → JWT stored in memory → route to /
      401 "not linked" → route to /register
      403 wrong role → show error screen "ไม่มีสิทธิ์เข้าใช้งาน"
```

JWT is stored in memory only (via Zustand/module var). On 401 from any subsequent API call, `liffLogin()` is called to re-initiate the flow.

---

## Pages

### `HomePage` (`/`)
The main screen after successful authentication.

**Sections:**
1. **Profile chip** — LINE picture (circle avatar), display name, role badge (`อาสาสมัคร (รออนุมัติ)` for GUEST, `ผู้ดูแลภาคสนาม` once promoted to CARE_GIVER)
2. **Upcoming doctor schedules** — fetched from `GET /doctor/schedules`, filtered client-side to entries where `zone.id === systemProfile.preferredZoneId` and `date >= today`, sorted ascending, max 10 shown. Each card shows: date (Thai locale), time range, zone tag, location, doctor name.
3. **Action buttons** — "แก้ไขโปรไฟล์" → `/profile` | "รายงานผู้ป่วย" → `/report`

**API calls:**
- `GET /auth/me` — system profile (role, preferredZone, etc.)
- `GET /doctor/schedules` — all schedules (filtered client-side)
- `GET /auth/public/zones` — zone list (for store, used by profile/report pages)

### `RegisterPage` (`/register`)
New user whose LINE account is not yet linked.

**Steps:**
1. Form — first name, last name, email (required), phone (optional), preferred zone (select from public zones)
2. Terms of Use — scrollable text, must reach bottom + check checkbox to enable submit

**Submit:** `POST /auth/liff/guest-register` → on success, store JWT → navigate to `/`

**Note:** Backend creates user with `role: 'GUEST'` (see backend changes).

### `ProfilePage` (`/profile`)
Edit own profile.

**Fields:** display name, phone, preferred zone (select)  
**Submit:** `PATCH /auth/me` → update store → navigate to `/`  
**Back:** chevron to `/` without saving

### `ReportPage` (`/report`)
Report a homeless person found in the field.

**Fields:**
- ชื่อ / นามแฝง (alias) — required, plain text (encrypted by backend)
- สถานที่พบ (location text) — required
- อาการเบื้องต้น (initial complaint) — required, textarea
- เพศ (gender) — optional, select: ชาย / หญิง / อื่นๆ
- อายุโดยประมาณ (estimated age) — optional, number input

**Submit:** `POST /patients/guest-report` → show success screen with generated HN and "กลับหน้าหลัก" button

---

## Zustand Store (`profileStore`)

```ts
interface ProfileStore {
  lineProfile: { userId: string; displayName: string; pictureUrl?: string } | null;
  systemProfile: { id: string; email: string; displayName: string; role: string;
                   preferredZoneId?: string | null;
                   preferredZone?: { id: string; name: string; color: string } | null;
                   phone?: string | null } | null;
  zones: { id: string; name: string; color: string }[];
  setLineProfile: (p) => void;
  setSystemProfile: (p) => void;
  updateSystemProfile: (partial) => void;
  setZones: (z) => void;
}
```

---

## Backend Changes

### 1. Fix `guestRegister` role (`apps/backend/src/modules/auth/auth.service.ts`)

In the `guestRegister` method, change `role: 'CARE_GIVER'` → `role: 'GUEST'`

Users who self-register via LIFF start as GUEST (pending admin approval). Admin promotes them to CARE_GIVER or another role via the web app. This aligns with the existing `ROLE_LABEL` mapping in the ProfilePage (`GUEST: 'อาสาสมัคร (รออนุมัติ)'`).

### 2. New endpoint: `POST /patients/guest-report`

**Controller:** `apps/backend/src/modules/patients/patients.controller.ts`  
**Service:** `apps/backend/src/modules/patients/patients.service.ts`

**Guard:** `JwtAuthGuard` only — no `@Roles()` decorator, so any valid JWT (including GUEST) can call it.

**Request body:**
```ts
{
  alias: string;          // required — encrypted into nameEnc by backend
  locationText: string;   // required
  initialComplaint: string; // required
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  age?: number;
}
```

**Behavior:**
- Encrypts `alias` using `AesGcmService` → stored as `nameEnc`
- Looks up the actor's `preferredZoneId` from DB (may be null — that is valid)
- Creates `Patient` with `status: PENDING`, `organizationId` from JWT, `zoneId: preferredZoneId ?? null`
- Returns `{ id: string; hn: string }`

**No new Prisma migration needed** — all `Patient` fields already exist.

**No nginx change needed** — `/api/patients/*` already routes to backend.

---

## API Client (`lib/api.ts`) — New methods

```ts
guestRegister(data: { idToken, firstName, lastName, email, phone?, zoneId? })
  → POST /auth/liff/guest-register

getDoctorSchedules()
  → GET /doctor/schedules  → any[]

guestReportPatient(data: { alias, locationText, initialComplaint, gender?, age? })
  → POST /patients/guest-report  → { id, hn }

getMe()         → GET /auth/me
updateMe(data)  → PATCH /auth/me
getPublicZones() → GET /auth/public/zones (unauthenticated)
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| LIFF init fails | Show static error screen with message |
| LINE not logged in | `liff.login()` redirect (non-blocking) |
| 401 on verify (not linked) | Navigate to `/register` |
| 403 on verify (wrong role) | Show "ไม่มีสิทธิ์เข้าใช้งาน" with LINE close button |
| 401 on subsequent API call | `liffLogin()` re-triggers auth flow |
| Network error on submit | Show inline error message, keep form data |
| Duplicate LINE account on register | Show "LINE นี้ลงทะเบียนแล้ว" with link flow hint |

---

## Out of Scope

- SOS button — not requested
- Task management — GUEST role has no tasks
- Patient detail view — GUEST cannot read patient PII
- Push notifications from this LIFF — handled by backend LINE service
- CARE_GIVER LIFF restoration — separate concern
