# Guest LIFF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a LINE LIFF app (`apps/liff`) for GUEST-role users that handles self-registration, profile editing, doctor schedule viewing, and patient reporting.

**Architecture:** Vite + React 19 SPA served under `/liff`, auth via LINE ID token verified by the existing NestJS backend, two backend changes (fix `guestRegister` role + add `guest-report` endpoint), four LIFF pages communicating through a Zustand profile store.

**Tech Stack:** `@line/liff` v2, React 19, react-router-dom v7, Zustand v5, Vite 6, TypeScript, NestJS (backend), Prisma (ORM), Jest (backend tests)

## Global Constraints

- Accent colour: `#6366F1` (indigo) — used throughout LIFF pages
- Background: `#F8FAFC`, card background `#ffffff`, border `#E2E8F0`
- No UI framework in LIFF — inline styles only (matches existing LIFF design system)
- Thai language labels for all UI copy
- LIFF base path: `/liff` (nginx and Vite `base` are both `/liff`)
- Backend env var for LIFF ID: `VITE_LIFF_ID`; API URL: `VITE_API_URL`
- `RolesGuard` uses `getAllAndOverride` — method-level `@Roles()` overrides class-level

---

## File Map

**Create:**
```
apps/liff/package.json
apps/liff/tsconfig.json
apps/liff/vite.config.ts
apps/liff/index.html
apps/liff/Dockerfile
apps/liff/Dockerfile.dev
apps/liff/nginx.conf
apps/liff/src/main.tsx
apps/liff/src/lib/liff.ts
apps/liff/src/lib/api.ts
apps/liff/src/store/profileStore.ts
apps/liff/src/pages/HomePage.tsx
apps/liff/src/pages/RegisterPage.tsx
apps/liff/src/pages/ProfilePage.tsx
apps/liff/src/pages/ReportPage.tsx
```

**Modify:**
```
apps/backend/src/modules/auth/auth.service.ts          — guestRegister: CARE_GIVER → GUEST
apps/backend/src/modules/patients/patients.service.ts  — add guestReport()
apps/backend/src/modules/patients/patients.controller.ts — add POST guest-report route
apps/backend/src/modules/patients/test/patients.service.spec.ts — add guestReport tests
```

---

## Task 1: Backend — Fix `guestRegister` role + add `guest-report` endpoint

**Files:**
- Modify: `apps/backend/src/modules/patients/test/patients.service.spec.ts`
- Modify: `apps/backend/src/modules/patients/patients.service.ts`
- Modify: `apps/backend/src/modules/patients/patients.controller.ts`
- Modify: `apps/backend/src/modules/auth/auth.service.ts`

**Interfaces:**
- Produces: `PatientsService.guestReport(actorId: string, orgId: string, data: GuestReportDto): Promise<{ id: string; hn: string }>`
- Produces: `POST /patients/guest-report` — accepts `{ alias, locationText, initialComplaint, gender?, age? }`, returns `{ id, hn }`

- [ ] **Step 1: Add failing test for `guestReport` in `patients.service.spec.ts`**

Open `apps/backend/src/modules/patients/test/patients.service.spec.ts`. Add this block after the existing `describe('create()')` block:

```typescript
describe('guestReport()', () => {
  it('creates a PENDING patient using actor preferredZoneId and encrypted alias', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ preferredZoneId: 'zone-abc' });
    mockPrisma.patient.findUnique.mockResolvedValue(null); // HN unique check
    mockPrisma.patient.create.mockResolvedValue({
      id: 'p99', hn: 'HN000000000099', nameEnc: 'enc:Stranger',
      organizationId: 'org1', caseManagerId: null, age: null, gender: null,
      status: 'PENDING', conditions: [], initialComplaint: 'Fever',
      locationText: 'Under bridge', phone: null, birthDate: null,
      nationalIdEnc: null, followUpTarget: null, zoneId: 'zone-abc',
      createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await service.guestReport('actor1', 'org1', {
      alias: 'Stranger',
      locationText: 'Under bridge',
      initialComplaint: 'Fever',
    });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'actor1' },
      select: { preferredZoneId: true },
    });
    expect(mockCrypto.encrypt).toHaveBeenCalledWith('Stranger');
    expect(mockPrisma.patient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org1',
          status: 'PENDING',
          zoneId: 'zone-abc',
        }),
      }),
    );
    expect(result).toEqual({ id: 'p99', hn: 'HN000000000099' });
  });

  it('creates patient with null zoneId when actor has no preferredZoneId', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ preferredZoneId: null });
    mockPrisma.patient.findUnique.mockResolvedValue(null);
    mockPrisma.patient.create.mockResolvedValue({
      id: 'p100', hn: 'HN000000000100', nameEnc: 'enc:Unknown',
      organizationId: 'org1', caseManagerId: null, age: null, gender: null,
      status: 'PENDING', conditions: [], initialComplaint: 'Unknown',
      locationText: 'Park', phone: null, birthDate: null,
      nationalIdEnc: null, followUpTarget: null, zoneId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await service.guestReport('actor2', 'org1', {
      alias: 'Unknown',
      locationText: 'Park',
      initialComplaint: 'Unknown',
    });

    expect(mockPrisma.patient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ zoneId: null }),
      }),
    );
    expect(result).toEqual({ id: 'p100', hn: 'HN000000000100' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && npx jest patients.service.spec --no-coverage 2>&1 | tail -20
```

Expected: FAIL with "service.guestReport is not a function"

- [ ] **Step 3: Add `guestReport` method to `patients.service.ts`**

Add this method to the `PatientsService` class, after the `create()` method (around line 71):

```typescript
async guestReport(actorId: string, orgId: string, data: {
  alias: string;
  locationText: string;
  initialComplaint: string;
  gender?: string;
  age?: number;
}) {
  const actor = await this.prisma.user.findUnique({
    where: { id: actorId },
    select: { preferredZoneId: true },
  });
  const hn = await this.generateHN();
  const patient = await this.prisma.patient.create({
    data: {
      organizationId: orgId,
      nameEnc: this.crypto.encrypt(data.alias),
      hn,
      age: data.age,
      gender: data.gender as any,
      status: 'PENDING',
      conditions: [],
      initialComplaint: data.initialComplaint,
      locationText: data.locationText,
      zoneId: actor?.preferredZoneId ?? null,
    },
  });
  return { id: patient.id, hn: patient.hn };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/backend && npx jest patients.service.spec --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS including the two new ones.

- [ ] **Step 5: Add `guest-report` route to `patients.controller.ts`**

Add this import at the top (add `UserRole` if not already imported — it already is):

Then add this method inside the `PatientsController` class, before the closing brace:

```typescript
@Post('guest-report')
@Roles(UserRole.GUEST)
guestReport(@Body() body: { alias: string; locationText: string; initialComplaint: string; gender?: string; age?: number }, @CurrentUser() user: JwtPayload) {
  if (!body.alias || !body.locationText || !body.initialComplaint) {
    throw new BadRequestException('alias, locationText และ initialComplaint จำเป็นต้องระบุ');
  }
  return this.patients.guestReport(user.sub, user.orgId, body);
}
```

Also add `BadRequestException` to the import from `@nestjs/common` at the top of the file (it's already `Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus` — add `BadRequestException` to that list).

- [ ] **Step 6: Fix `guestRegister` role in `auth.service.ts`**

In `apps/backend/src/modules/auth/auth.service.ts`, find the `guestRegister` method. Change line:

```typescript
// BEFORE
role: 'CARE_GIVER',
```

to:

```typescript
// AFTER
role: 'GUEST',
```

Also update the SSE emission immediately after the `prisma.user.create` call in the same method:

```typescript
// BEFORE
this.sseService.emit(org.id, ['CASE_MANAGER', 'ADMIN', 'SUPER_ADMIN'], {
  type: 'member_joined',
  name: `${data.firstName} ${data.lastName}`,
  role: 'CARE_GIVER',
});

// AFTER
this.sseService.emit(org.id, ['CASE_MANAGER', 'ADMIN', 'SUPER_ADMIN'], {
  type: 'guest_joined',
  name: `${data.firstName} ${data.lastName}`,
  role: 'GUEST',
});
```

- [ ] **Step 7: Run full backend test suite**

```bash
cd apps/backend && npx jest --no-coverage 2>&1 | tail -30
```

Expected: All tests PASS. No regressions.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/auth/auth.service.ts \
        apps/backend/src/modules/patients/patients.service.ts \
        apps/backend/src/modules/patients/patients.controller.ts \
        apps/backend/src/modules/patients/test/patients.service.spec.ts
git commit -m "feat(backend): fix guestRegister role to GUEST and add guest-report endpoint"
```

---

## Task 2: LIFF — Scaffold config files + lib + store

**Files:**
- Create: `apps/liff/package.json`
- Create: `apps/liff/tsconfig.json`
- Create: `apps/liff/vite.config.ts`
- Create: `apps/liff/index.html`
- Create: `apps/liff/Dockerfile`
- Create: `apps/liff/Dockerfile.dev`
- Create: `apps/liff/nginx.conf`
- Create: `apps/liff/src/lib/liff.ts`
- Create: `apps/liff/src/lib/api.ts`
- Create: `apps/liff/src/store/profileStore.ts`
- Create: `apps/liff/src/main.tsx` (minimal placeholder)

**Interfaces:**
- Produces: `initLiff(): Promise<void>`, `liffLogin(): void` from `lib/liff.ts`
- Produces: `api` object with `verifyLiff`, `guestRegister`, `getPublicZones`, `getMe`, `updateMe`, `getDoctorSchedules`, `guestReportPatient` from `lib/api.ts`
- Produces: `useProfileStore` Zustand store from `store/profileStore.ts`

- [ ] **Step 1: Create `apps/liff/package.json`**

```json
{
  "name": "@homemed/liff",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@line/liff": "^2.25.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.17.0",
    "zustand": "^5.0.14"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.8.3",
    "vite": "^6.2.0"
  }
}
```

- [ ] **Step 2: Create `apps/liff/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `apps/liff/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: '0.0.0.0' },
  base: '/liff',
});
```

- [ ] **Step 4: Create `apps/liff/index.html`**

```html
<!DOCTYPE html>
<html lang="th">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HomeMed Connect — Guest</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `apps/liff/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package*.json ./apps/frontend/
COPY apps/liff/package*.json ./apps/liff/
COPY packages/ ./packages/

RUN npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retry-maxtimeout 60000 && \
    npm config set fetch-timeout 300000 && \
    npm ci

COPY apps/liff/ ./apps/liff/

ARG VITE_API_URL
ARG VITE_LIFF_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LIFF_ID=$VITE_LIFF_ID

WORKDIR /app/apps/liff
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/apps/liff/dist /usr/share/nginx/html/liff
COPY apps/liff/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 6: Create `apps/liff/Dockerfile.dev`**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]
```

- [ ] **Step 7: Create `apps/liff/nginx.conf`**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;

    location /liff {
        try_files $uri $uri/ /liff/index.html;
    }

    location / {
        return 404;
    }
}
```

- [ ] **Step 8: Install dependencies**

```bash
cd /path/to/repo && npm install
```

Expected: `node_modules/@line/liff`, `node_modules/react-router-dom`, `node_modules/zustand` present under `node_modules` (monorepo root install).

- [ ] **Step 9: Create `apps/liff/src/lib/liff.ts`**

```typescript
import liff from '@line/liff';

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string;

export function liffLogin(): void {
  const redirectUri = `${window.location.origin}/liff/`;
  liff.login({ redirectUri });
}

export async function initLiff(): Promise<void> {
  await liff.init({ liffId: LIFF_ID });
  if (!liff.isLoggedIn() || !liff.getIDToken()) {
    liffLogin();
  }
}
```

- [ ] **Step 10: Create `apps/liff/src/lib/api.ts`**

```typescript
import { liffLogin } from './liff';

const API_URL = import.meta.env.VITE_API_URL as string;

let accessToken: string | null = null;

export function setToken(token: string) { accessToken = token; }
export function getToken(): string | null { return accessToken; }

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401 && accessToken) {
      accessToken = null;
      liffLogin();
      return new Promise(() => {});
    }
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.message ?? 'Request failed'), { status: res.status });
  }
  return res.json();
}

export interface Zone { id: string; name: string; color: string }

export interface SystemProfile {
  id: string;
  email: string;
  displayName?: string;
  phone?: string | null;
  role: string;
  preferredZoneId?: string | null;
  preferredZone?: Zone | null;
}

export const api = {
  verifyLiff: (idToken: string) =>
    request<{ accessToken: string }>('/auth/liff/verify', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),

  guestRegister: (data: {
    idToken: string; firstName: string; lastName: string;
    email: string; phone?: string; zoneId?: string;
  }) =>
    request<{ accessToken: string }>('/auth/liff/guest-register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getPublicZones: (): Promise<Zone[]> =>
    fetch(`${API_URL}/auth/public/zones`).then((r) => r.ok ? r.json() : []),

  getMe: () => request<SystemProfile>('/auth/me'),

  updateMe: (data: { displayName?: string; phone?: string; preferredZoneId?: string }) =>
    request<SystemProfile>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getDoctorSchedules: () => request<any[]>('/doctor/schedules'),

  guestReportPatient: (data: {
    alias: string; locationText: string; initialComplaint: string;
    gender?: string; age?: number;
  }) =>
    request<{ id: string; hn: string }>('/patients/guest-report', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
```

- [ ] **Step 11: Create `apps/liff/src/store/profileStore.ts`**

```typescript
import { create } from 'zustand';
import type { Zone, SystemProfile } from '../lib/api';

export type { SystemProfile, Zone };

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

interface ProfileStore {
  lineProfile: LineProfile | null;
  systemProfile: SystemProfile | null;
  zones: Zone[];
  setLineProfile: (p: LineProfile) => void;
  setSystemProfile: (p: SystemProfile) => void;
  setZones: (z: Zone[]) => void;
  updateSystemProfile: (partial: Partial<SystemProfile>) => void;
}

export const useProfileStore = create<ProfileStore>((set) => ({
  lineProfile: null,
  systemProfile: null,
  zones: [],
  setLineProfile: (p) => set({ lineProfile: p }),
  setSystemProfile: (p) => set({ systemProfile: p }),
  setZones: (z) => set({ zones: z }),
  updateSystemProfile: (partial) =>
    set((state) => ({
      systemProfile: state.systemProfile ? { ...state.systemProfile, ...partial } : null,
    })),
}));
```

- [ ] **Step 12: Create minimal `apps/liff/src/main.tsx` placeholder**

```tsx
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <div style={{ padding: 20, fontFamily: 'sans-serif' }}>Loading…</div>
);
```

- [ ] **Step 13: Verify TypeScript build succeeds**

```bash
cd apps/liff && npx tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 14: Commit**

```bash
git add apps/liff/
git commit -m "feat(liff): scaffold Guest LIFF — config, lib, store"
```

---

## Task 3: LIFF — Auth shell (`main.tsx`) + `RegisterPage`

**Files:**
- Modify: `apps/liff/src/main.tsx` (full implementation)
- Create: `apps/liff/src/pages/RegisterPage.tsx`

**Interfaces:**
- Consumes: `initLiff()`, `liffLogin()` from `lib/liff.ts`
- Consumes: `api.verifyLiff`, `api.guestRegister`, `api.getMe`, `api.getPublicZones`, `setToken` from `lib/api.ts`
- Consumes: `useProfileStore` from `store/profileStore.ts`
- Produces: auth routing shell; `RegisterPage` at `/register`

- [ ] **Step 1: Replace `apps/liff/src/main.tsx` with full implementation**

```tsx
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { initLiff } from './lib/liff';
import { api, setToken } from './lib/api';
import { useProfileStore } from './store/profileStore';
import HomePage from './pages/HomePage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import ReportPage from './pages/ReportPage';

const ACCENT = '#6366F1';

function AppRoutes() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setLineProfile, setSystemProfile, setZones } = useProfileStore();

  useEffect(() => {
    async function init() {
      try {
        await initLiff();
        const idToken = liff.getIDToken();
        if (!idToken) return; // redirect in progress

        liff.getProfile()
          .then((p) => setLineProfile({ userId: p.userId, displayName: p.displayName, pictureUrl: p.pictureUrl ?? undefined }))
          .catch(() => {});

        try {
          const { accessToken } = await api.verifyLiff(idToken);
          setToken(accessToken);
          Promise.all([api.getMe(), api.getPublicZones()])
            .then(([me, zones]) => { setSystemProfile(me); setZones(zones); })
            .catch(() => {});
          setReady(true);
        } catch (e: any) {
          if (e.status === 401 || e.message?.includes('not linked')) {
            const zones = await api.getPublicZones().catch(() => []);
            setZones(zones);
            navigate('/register', { replace: true });
            setReady(true);
          } else if (e.status === 403) {
            setError('ไม่มีสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
          } else {
            throw e;
          }
        }
      } catch (e: any) {
        setError(e.message ?? 'เกิดข้อผิดพลาด');
      }
    }
    init();
  }, []);

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 40, marginBottom: 12 }}>⚠️</p>
        <p style={{ fontWeight: 600, color: '#374151', fontSize: 15 }}>{error}</p>
      </div>
    </div>
  );

  if (!ready) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#9CA3AF', fontSize: 14, fontFamily: 'monospace' }}>กำลังโหลด...</p>
    </div>
  );

  return (
    <Routes>
      <Route path="/"         element={<HomePage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/profile"  element={<ProfilePage />} />
      <Route path="/report"   element={<ReportPage />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter basename="/liff">
      <AppRoutes />
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
```

- [ ] **Step 2: Create `apps/liff/src/pages/RegisterPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { api, setToken } from '../lib/api';
import { useProfileStore } from '../store/profileStore';

const ACCENT = '#6366F1';
const INP: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0',
  borderRadius: 9, fontSize: 14, boxSizing: 'border-box',
  background: '#F8FAFC', color: '#0F172A', outline: 'none', marginTop: 4,
};
const LBL: React.CSSProperties = {
  fontSize: 11, color: '#94A3B8', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.06em',
};

const TERMS = `ข้อกำหนดการใช้งาน (Terms of Use)

1. การใช้งานแอปพลิเคชัน
ผู้ใช้ตกลงที่จะใช้งานระบบเพื่อวัตถุประสงค์ด้านสาธารณสุขและการดูแลผู้ป่วยไร้บ้านเท่านั้น ห้ามนำข้อมูลไปใช้ในทางที่ไม่เหมาะสมหรือผิดกฎหมาย

2. ความรับผิดชอบของผู้ใช้
ผู้ใช้มีหน้าที่รักษาข้อมูลส่วนตัว รวมถึงรายงานการใช้งานที่ผิดปกติแก่ผู้ดูแลระบบทันที

3. ข้อมูลผู้ป่วย
ข้อมูลผู้ป่วยทั้งหมดในระบบถือเป็นข้อมูลลับ ห้ามเปิดเผยหรือนำออกนอกระบบโดยไม่ได้รับอนุญาต

4. การยกเลิกบัญชี
ผู้ดูแลระบบมีสิทธิ์ระงับหรือยกเลิกบัญชีที่ละเมิดข้อกำหนดได้ทันที`;

export default function RegisterPage() {
  const navigate = useNavigate();
  const { lineProfile, zones, setSystemProfile } = useProfileStore();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', zoneId: '' });
  const [step, setStep] = useState<'form' | 'terms'>('form');
  const [scrolled, setScrolled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setLoading(true);
    setError('');
    try {
      const idToken = liff.getIDToken();
      if (!idToken) throw new Error('ไม่พบ LINE token');
      const { accessToken } = await api.guestRegister({
        idToken,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        zoneId: form.zoneId || undefined,
      });
      setToken(accessToken);
      const me = await api.getMe();
      setSystemProfile(me);
      navigate('/', { replace: true });
    } catch (e: any) {
      setError(e.message ?? 'ลงทะเบียนไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'terms') return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: 16, paddingTop: 24, maxWidth: 480, margin: '0 auto' }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>ข้อตกลงและนโยบาย</h2>
      <div
        onScroll={(e) => { const el = e.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) setScrolled(true); }}
        style={{ height: 320, overflowY: 'auto', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 14, fontSize: 13, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 16 }}
      >
        {TERMS}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, opacity: scrolled ? 1 : 0.4 }}>
        <input type="checkbox" disabled={!scrolled} checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ width: 18, height: 18 }} />
        <span style={{ fontSize: 13, color: '#0F172A' }}>ฉันได้อ่านและยอมรับข้อตกลงแล้ว</span>
      </label>
      {error && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      <button
        disabled={!checked || loading}
        onClick={submit}
        style={{ width: '100%', padding: '12px', background: checked && !loading ? ACCENT : '#CBD5E1', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: checked && !loading ? 'pointer' : 'default' }}
      >
        {loading ? 'กำลังลงทะเบียน...' : 'ยืนยันและลงทะเบียน'}
      </button>
      <button onClick={() => setStep('form')} style={{ width: '100%', marginTop: 10, padding: '10px', background: 'transparent', border: 'none', color: '#94A3B8', fontSize: 13, cursor: 'pointer' }}>
        ← ย้อนกลับ
      </button>
    </div>
  );

  const valid = form.firstName.trim() && form.lastName.trim() && form.email.trim().includes('@');

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: 16, paddingTop: 24, maxWidth: 480, margin: '0 auto' }}>
      {lineProfile?.pictureUrl && (
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img src={lineProfile.pictureUrl} alt="" style={{ width: 72, height: 72, borderRadius: '50%', border: `3px solid ${ACCENT}` }} />
          <p style={{ marginTop: 8, fontSize: 14, color: '#64748B' }}>สวัสดี, {lineProfile.displayName}</p>
        </div>
      )}
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>ลงทะเบียนอาสาสมัคร</h2>
      <p style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>กรอกข้อมูลเพื่อเข้าร่วมเครือข่ายคลินิกผู้ไร้บ้าน</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={LBL}>ชื่อ *</label>
            <input style={INP} value={form.firstName} onChange={set('firstName')} placeholder="สมชาย" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={LBL}>นามสกุล *</label>
            <input style={INP} value={form.lastName} onChange={set('lastName')} placeholder="ใจดี" />
          </div>
        </div>
        <div>
          <label style={LBL}>อีเมล *</label>
          <input style={INP} type="email" value={form.email} onChange={set('email')} placeholder="example@email.com" />
        </div>
        <div>
          <label style={LBL}>เบอร์โทรศัพท์</label>
          <input style={INP} type="tel" value={form.phone} onChange={set('phone')} placeholder="08xxxxxxxx" />
        </div>
        <div>
          <label style={LBL}>พื้นที่ที่สนใจ</label>
          <select style={{ ...INP, appearance: 'none' }} value={form.zoneId} onChange={set('zoneId')}>
            <option value="">— เลือกพื้นที่ —</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
      </div>

      <button
        disabled={!valid}
        onClick={() => setStep('terms')}
        style={{ width: '100%', marginTop: 24, padding: '12px', background: valid ? ACCENT : '#CBD5E1', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: valid ? 'pointer' : 'default' }}
      >
        ถัดไป: อ่านข้อตกลง →
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript build**

```bash
cd apps/liff && npx tsc --noEmit 2>&1
```

Expected: No errors (pages that don't exist yet will cause errors — if so, create empty placeholder files `pages/HomePage.tsx`, `pages/ProfilePage.tsx`, `pages/ReportPage.tsx` each exporting `export default function X() { return null; }`).

- [ ] **Step 4: Manual test — dev server**

```bash
cd apps/liff && VITE_API_URL=http://localhost:3001 VITE_LIFF_ID=dummy npx vite
```

Open `http://localhost:5173/liff/` in browser. Expected: loading spinner shown (LIFF init will fail with dummy ID — that's fine, confirms render works).

- [ ] **Step 5: Commit**

```bash
git add apps/liff/src/main.tsx apps/liff/src/pages/RegisterPage.tsx
git commit -m "feat(liff): auth shell and RegisterPage for GUEST self-registration"
```

---

## Task 4: LIFF — `HomePage`

**Files:**
- Modify: `apps/liff/src/pages/HomePage.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `useProfileStore` — `systemProfile`, `lineProfile`
- Consumes: `api.getDoctorSchedules()` → `any[]`
- Produces: main screen at `/`

- [ ] **Step 1: Create `apps/liff/src/pages/HomePage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useProfileStore } from '../store/profileStore';

const ACCENT = '#6366F1';

const ROLE_LABEL: Record<string, string> = {
  GUEST:             'อาสาสมัคร (รออนุมัติ)',
  CARE_GIVER:        'ผู้ดูแลภาคสนาม',
  CASE_MANAGER:      'Case Manager',
  MEDICAL_VOLUNTEER: 'อาสาพยาบาล',
  DOCTOR:            'แพทย์',
  ADMIN:             'ผู้ดูแลระบบ',
  SUPER_ADMIN:       'ผู้อำนวยการ',
};

const ROLE_COLOR: Record<string, string> = {
  GUEST:             '#D97706',
  CARE_GIVER:        '#16A34A',
  CASE_MANAGER:      '#2563EB',
  MEDICAL_VOLUNTEER: ACCENT,
  DOCTOR:            '#0284C7',
  ADMIN:             '#DC2626',
  SUPER_ADMIN:       '#7C3AED',
};

export default function HomePage() {
  const navigate = useNavigate();
  const { lineProfile, systemProfile } = useProfileStore();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDoctorSchedules()
      .then((all) => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const zoneId = systemProfile?.preferredZoneId;
        const upcoming = all
          .filter((s: any) => new Date(s.date) >= today && (!zoneId || s.zone?.id === zoneId))
          .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(0, 10);
        setSchedules(upcoming);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [systemProfile?.preferredZoneId]);

  const role = systemProfile?.role ?? 'GUEST';
  const roleLabel = ROLE_LABEL[role] ?? role;
  const roleColor = ROLE_COLOR[role] ?? ACCENT;
  const picture = lineProfile?.pictureUrl ?? systemProfile?.avatarUrl;

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', paddingBottom: 32 }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 0' }}>

        {/* Profile chip */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          {picture
            ? <img src={picture} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
            : <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>👤</div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {systemProfile?.displayName ?? lineProfile?.displayName ?? '—'}
            </p>
            {systemProfile?.preferredZone && (
              <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>📍 {systemProfile.preferredZone.name}</p>
            )}
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: roleColor, background: roleColor + '18', border: `1px solid ${roleColor}44`, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
            {roleLabel}
          </span>
        </div>

        {/* Upcoming schedules */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #F1F5F9' }}>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', margin: 0 }}>📅 กำหนดการลงพื้นที่ที่จะถึง</p>
            {systemProfile?.preferredZone && (
              <p style={{ fontSize: 11, color: '#94A3B8', margin: '3px 0 0' }}>เฉพาะพื้นที่: {systemProfile.preferredZone.name}</p>
            )}
          </div>
          {loading
            ? <div style={{ padding: '20px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>กำลังโหลด...</div>
            : schedules.length === 0
              ? <div style={{ padding: '20px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>ยังไม่มีกำหนดการ</div>
              : schedules.map((s, i) => (
                <div key={s.id} style={{ padding: '12px 16px', borderTop: i > 0 ? '1px solid #F1F5F9' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>
                      {new Date(s.date).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    <span style={{ fontSize: 12, color: '#64748B' }}>{s.startTime} – {s.endTime}</span>
                    {s.zone && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: s.zone.color ?? ACCENT, borderRadius: 20, padding: '1px 8px' }}>
                        {s.zone.name}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>
                    📍 {s.location ?? 'ไม่ระบุสถานที่'}
                    {s.doctor?.displayName ? ` · ${s.doctor.displayName}` : ''}
                  </p>
                </div>
              ))
          }
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => navigate('/profile')}
            style={{ flex: 1, padding: '13px', background: '#fff', border: `1.5px solid ${ACCENT}`, color: ACCENT, borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            แก้ไขโปรไฟล์
          </button>
          <button
            onClick={() => navigate('/report')}
            style={{ flex: 1, padding: '13px', background: ACCENT, border: 'none', color: '#fff', borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            รายงานผู้ป่วย
          </button>
        </div>

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript build**

```bash
cd apps/liff && npx tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/liff/src/pages/HomePage.tsx
git commit -m "feat(liff): add HomePage with profile chip and doctor schedule"
```

---

## Task 5: LIFF — `ProfilePage`

**Files:**
- Modify: `apps/liff/src/pages/ProfilePage.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `useProfileStore` — `systemProfile`, `zones`, `updateSystemProfile`
- Consumes: `api.updateMe()`

- [ ] **Step 1: Create `apps/liff/src/pages/ProfilePage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useProfileStore } from '../store/profileStore';

const ACCENT = '#6366F1';
const INP: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0',
  borderRadius: 9, fontSize: 14, boxSizing: 'border-box',
  background: '#F8FAFC', color: '#0F172A', outline: 'none', marginTop: 4,
};
const LBL: React.CSSProperties = {
  fontSize: 11, color: '#94A3B8', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.06em',
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const { systemProfile, zones, updateSystemProfile } = useProfileStore();
  const [form, setForm] = useState({ displayName: '', phone: '', preferredZoneId: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!systemProfile) return;
    setForm({
      displayName: systemProfile.displayName ?? '',
      phone: systemProfile.phone ?? '',
      preferredZoneId: systemProfile.preferredZoneId ?? '',
    });
  }, [systemProfile]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateMe({
        displayName: form.displayName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        preferredZoneId: form.preferredZoneId, // always send; empty string → backend sets null
      });
      updateSystemProfile(updated);
      setToast('บันทึกสำเร็จ');
      setTimeout(() => { setToast(''); navigate('/'); }, 1200);
    } catch (e: any) {
      setError(e.message ?? 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: 16, paddingTop: 24, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748B', padding: 0 }}>←</button>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0 }}>แก้ไขโปรไฟล์</h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={LBL}>ชื่อที่แสดง</label>
          <input style={INP} value={form.displayName} onChange={set('displayName')} placeholder="ชื่อ-นามสกุล" />
        </div>
        <div>
          <label style={LBL}>เบอร์โทรศัพท์</label>
          <input style={INP} type="tel" value={form.phone} onChange={set('phone')} placeholder="08xxxxxxxx" />
        </div>
        <div>
          <label style={LBL}>พื้นที่ที่สนใจ</label>
          <select style={{ ...INP, appearance: 'none' } as React.CSSProperties} value={form.preferredZoneId} onChange={set('preferredZoneId')}>
            <option value="">— ไม่ระบุ —</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
      </div>

      {error && <p style={{ color: '#EF4444', fontSize: 13, marginTop: 12 }}>{error}</p>}
      {toast && <p style={{ color: '#16A34A', fontSize: 13, marginTop: 12, fontWeight: 600 }}>{toast}</p>}

      <button
        onClick={save}
        disabled={saving}
        style={{ width: '100%', marginTop: 24, padding: '12px', background: saving ? '#CBD5E1' : ACCENT, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: saving ? 'default' : 'pointer' }}
      >
        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript build**

```bash
cd apps/liff && npx tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/liff/src/pages/ProfilePage.tsx
git commit -m "feat(liff): add ProfilePage for editing name, phone, zone"
```

---

## Task 6: LIFF — `ReportPage`

**Files:**
- Modify: `apps/liff/src/pages/ReportPage.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `api.guestReportPatient()` → `{ id: string; hn: string }`

- [ ] **Step 1: Create `apps/liff/src/pages/ReportPage.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const ACCENT = '#6366F1';
const INP: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0',
  borderRadius: 9, fontSize: 14, boxSizing: 'border-box',
  background: '#F8FAFC', color: '#0F172A', outline: 'none', marginTop: 4,
};
const LBL: React.CSSProperties = {
  fontSize: 11, color: '#94A3B8', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.06em',
};

export default function ReportPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    alias: '', locationText: '', initialComplaint: '', gender: '', age: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ id: string; hn: string } | null>(null);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const data = await api.guestReportPatient({
        alias: form.alias.trim(),
        locationText: form.locationText.trim(),
        initialComplaint: form.initialComplaint.trim(),
        gender: form.gender || undefined,
        age: form.age ? parseInt(form.age, 10) : undefined,
      });
      setResult(data);
    } catch (e: any) {
      setError(e.message ?? 'ส่งข้อมูลไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  const valid = form.alias.trim() && form.locationText.trim() && form.initialComplaint.trim();

  if (result) return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 34 }}>✅</div>
        <h2 style={{ fontWeight: 700, fontSize: 18, color: '#0F172A', marginBottom: 8 }}>ส่งข้อมูลสำเร็จ</h2>
        <p style={{ fontSize: 14, color: '#64748B', marginBottom: 4 }}>ทีมงานจะติดตามผู้ป่วยรายนี้</p>
        <p style={{ fontSize: 20, fontWeight: 800, color: ACCENT, marginBottom: 24 }}>{result.hn}</p>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '12px 32px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
        >
          กลับหน้าหลัก
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: 16, paddingTop: 24, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748B', padding: 0 }}>←</button>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0 }}>รายงานผู้ป่วย</h2>
      </div>
      <p style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>พบผู้ไร้บ้านที่ต้องการความช่วยเหลือ? กรอกข้อมูลเบื้องต้น</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={LBL}>ชื่อ / นามแฝง *</label>
          <input style={INP} value={form.alias} onChange={set('alias')} placeholder="เช่น ลุงดำ หรือ ไม่ทราบชื่อ" />
        </div>
        <div>
          <label style={LBL}>สถานที่พบ *</label>
          <input style={INP} value={form.locationText} onChange={set('locationText')} placeholder="เช่น ใต้สะพาน, หน้าวัด..." />
        </div>
        <div>
          <label style={LBL}>อาการเบื้องต้น *</label>
          <textarea
            style={{ ...INP, minHeight: 80, resize: 'vertical' } as React.CSSProperties}
            value={form.initialComplaint}
            onChange={set('initialComplaint')}
            placeholder="เช่น มีไข้ ไม่รู้สึกตัว บาดเจ็บที่ขา..."
          />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={LBL}>เพศ</label>
            <select style={{ ...INP, appearance: 'none' } as React.CSSProperties} value={form.gender} onChange={set('gender')}>
              <option value="">— ไม่ระบุ —</option>
              <option value="MALE">ชาย</option>
              <option value="FEMALE">หญิง</option>
              <option value="OTHER">อื่นๆ</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={LBL}>อายุโดยประมาณ</label>
            <input style={INP} type="number" min="0" max="120" value={form.age} onChange={set('age')} placeholder="ปี" />
          </div>
        </div>
      </div>

      {error && <p style={{ color: '#EF4444', fontSize: 13, marginTop: 12 }}>{error}</p>}

      <button
        disabled={!valid || submitting}
        onClick={submit}
        style={{ width: '100%', marginTop: 24, padding: '12px', background: valid && !submitting ? ACCENT : '#CBD5E1', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: valid && !submitting ? 'pointer' : 'default' }}
      >
        {submitting ? 'กำลังส่งข้อมูล...' : 'ส่งรายงาน'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify full TypeScript build**

```bash
cd apps/liff && npx tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 3: Verify Vite production build**

```bash
cd apps/liff && VITE_API_URL=https://line5566.duckdns.org/api VITE_LIFF_ID=dummy npx vite build 2>&1 | tail -20
```

Expected: `dist/` folder created with `dist/liff/index.html` and JS/CSS assets. No build errors.

- [ ] **Step 4: Commit**

```bash
git add apps/liff/src/pages/ReportPage.tsx
git commit -m "feat(liff): add ReportPage for guest patient reporting"
```

---

## Post-Implementation Checklist

Before declaring the feature complete:

- [ ] Backend tests all pass: `cd apps/backend && npx jest --no-coverage`
- [ ] LIFF TypeScript clean: `cd apps/liff && npx tsc --noEmit`
- [ ] LIFF production build succeeds with real env vars
- [ ] `VITE_LIFF_ID` is set in `.env` to the real LIFF app ID from LINE Developer Console
- [ ] The LIFF endpoint URL registered in LINE Developer Console matches `https://line5566.duckdns.org/liff/`
- [ ] `docker compose build liff && docker compose up liff` starts without error
- [ ] Open the LIFF URL in LINE app — loading screen appears, then either register form (new user) or homepage (returning user)
