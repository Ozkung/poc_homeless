# LIFF Guest → NextAuth Session Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a guest logs in via LINE inside the LIFF mini-app, hand them off into the main Next.js app with a real, persistent NextAuth session (instead of the in-memory-only token that's lost on every refresh), making the already-existing but currently-unreachable `(guest)/guest/dashboard` page usable, and add a guest profile page with a "link to another account" (role-sync) flow.

**Architecture:** A short-lived, single-use Redis-backed handoff code (mirroring OAuth's authorization-code pattern) bridges the LIFF Vite SPA and the Next.js app — LIFF never hands raw tokens across the boundary, only a ~60-second one-time code. NextAuth's existing `CredentialsProvider.authorize()` gains a second credential shape (`liffHandoffCode`) alongside the existing `email`/`password` shape, so no new provider is needed. The same code-issuing helper is reused for the profile page's "link to another account" flow, which additionally reassigns the guest's created data (patients reported, activities, form submissions) to the linked account and deletes the now-empty guest row.

**Tech Stack:** NestJS backend (existing `auth` module, Redis via `ioredis`), Next.js App Router + NextAuth v4 (existing `CredentialsProvider`), Vite LIFF app (existing `apps/liff/`).

## Global Constraints

- The actual session tokens must never appear in a URL, browser history, or referrer header — only a short-lived (~60s), single-use opaque code crosses from LIFF into the Next.js app.
- LIFF's field-work routes (`/report`, `/add`, task check-in/notes/forms) and its `HomePage` (profile chip, upcoming schedules) are unchanged — the only LIFF-side change is the existing "แก้ไขโปรไฟล์" button, which now triggers the handoff instead of navigating to LIFF's own `/profile` route.
- New guest registration (`RegisterPage.tsx`'s `submit()`) is unchanged — a newly-registered guest still lands on LIFF's `HomePage` as today, exactly like a returning guest who just verified.
- On successful "link to another account," the guest's `lineUserId`/`lineDisplayName`/`linePictureUrl` move onto the target staff account, everything the guest row created (`Patient.reportedById`, `Activity.actorId`, `Submission.submittedById`) is reassigned to the target account, and the now-empty guest row is deleted — all inside one Prisma transaction.
- The "Unlink LINE" button in the shared `ProfilePage` component must not be shown to `GUEST`-role users — they have no password they know (registered with a random UUID-derived hash), so unlinking would permanently lock them out.
- Reuse `AuthService.issueTokens()` for every token issuance in this feature — no parallel token-generation logic.
- Follow this codebase's existing patterns exactly: `@InjectRedis() private redis: Redis` for Redis access, `JwtAuthGuard` + `@CurrentUser()` for authenticated endpoints, `cookieOpts()` for setting the refresh cookie, class-validator DTOs, Thai error messages matching the existing style in `auth.service.ts`.

---

### Task 1: Backend — LIFF handoff code issuance and exchange

**Files:**
- Modify: `apps/backend/src/modules/auth/auth.service.ts`
- Modify: `apps/backend/src/modules/auth/auth.controller.ts`
- Create: `apps/backend/src/modules/auth/dto/handoff-exchange.dto.ts`
- Test: `apps/backend/src/modules/auth/test/liff-handoff.service.spec.ts`

**Interfaces:**
- Consumes: existing `issueTokens()` (private method, already in the file), `@InjectRedis() redis: Redis` (already injected in the constructor), `JwtAuthGuard`/`CurrentUser`/`JwtPayload` (existing).
- Produces: `AuthService.createLiffHandoffCode(userId: string): Promise<{ code: string }>` and `AuthService.exchangeLiffHandoffCode(code: string): Promise<{ accessToken: string; refreshToken: string; role: string; displayName: string; avatarUrl: string | null }>` — the second is also consumed by Task 2's `linkRole()`. `POST /auth/liff/handoff` (JWT-guarded) and `POST /auth/liff/handoff/exchange` (public) — consumed by Task 3 (NextAuth's `authorize()`) and Task 6 (LIFF's new button handler).

- [ ] **Step 1: Write the DTO**

Create `apps/backend/src/modules/auth/dto/handoff-exchange.dto.ts`:

```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class HandoffExchangeDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/backend/src/modules/auth/test/liff-handoff.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SseService } from '../../notifications/sse.service';

const mockPrisma: any = { user: { findUnique: jest.fn() } };
const mockJwt = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };
const mockConfig = { get: jest.fn((key: string) => (key === 'jwt.expiresIn' ? '1h' : key === 'jwt.refreshExpiresIn' ? '30d' : '')) };
const mockSse = { emit: jest.fn() };
const mockRedis = { setex: jest.fn(), get: jest.fn(), del: jest.fn() };

describe('AuthService — LIFF handoff', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getRedisConnectionToken('default'), useValue: mockRedis },
        { provide: SseService, useValue: mockSse },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  describe('createLiffHandoffCode', () => {
    it('generates a code and stores the userId in Redis with a short TTL', async () => {
      const result = await service.createLiffHandoffCode('user1');

      expect(result.code).toBeDefined();
      expect(typeof result.code).toBe('string');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('liff-handoff:'),
        expect.any(Number),
        'user1',
      );
      const [, ttl] = mockRedis.setex.mock.calls[0];
      expect(ttl).toBeLessThanOrEqual(60);
    });
  });

  describe('exchangeLiffHandoffCode', () => {
    it('issues fresh tokens for a valid, unexpired code and deletes it (single-use)', async () => {
      mockRedis.get.mockResolvedValue('user1');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user1', email: 'guest@example.com', role: 'GUEST',
        organizationId: 'org1', displayName: 'Guest One', avatarUrl: null, isActive: true,
      });

      const result = await service.exchangeLiffHandoffCode('abc123');

      expect(result.accessToken).toBe('signed-jwt');
      expect(result.refreshToken).toBeDefined();
      expect(result.role).toBe('GUEST');
      expect(mockRedis.del).toHaveBeenCalledWith(expect.stringContaining('liff-handoff:abc123'));
    });

    it('rejects an unknown or expired code', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.exchangeLiffHandoffCode('bad-code')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a code for a deactivated user', async () => {
      mockRedis.get.mockResolvedValue('user1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user1', isActive: false });

      await expect(service.exchangeLiffHandoffCode('abc123')).rejects.toThrow(UnauthorizedException);
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx jest liff-handoff.service.spec.ts
```

Expected: FAIL — `service.createLiffHandoffCode is not a function`.

- [ ] **Step 4: Implement `createLiffHandoffCode` and `exchangeLiffHandoffCode`**

Add these two public methods to `apps/backend/src/modules/auth/auth.service.ts`, right after the existing `linkLine()` method:

```typescript
  async createLiffHandoffCode(userId: string): Promise<{ code: string }> {
    const code = randomUUID();
    await this.redis.setex(`liff-handoff:${code}`, 60, userId);
    return { code };
  }

  async exchangeLiffHandoffCode(code: string) {
    const key = `liff-handoff:${code}`;
    const userId = await this.redis.get(key);
    if (!userId) throw new UnauthorizedException('Handoff code invalid or expired');
    await this.redis.del(key);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException();

    return this.issueTokens(user.id, user.email, user.role, user.organizationId, user.displayName, user.avatarUrl ?? null);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx jest liff-handoff.service.spec.ts
```

Expected: all 4 tests pass.

- [ ] **Step 6: Add the controller endpoints**

Add these two handlers to `apps/backend/src/modules/auth/auth.controller.ts`, right after the existing `liffLink()` handler:

```typescript
  @Post('liff/handoff')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  liffHandoff(@CurrentUser() user: JwtPayload) {
    return this.auth.createLiffHandoffCode(user.sub);
  }

  @Post('liff/handoff/exchange')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async liffHandoffExchange(@Body() dto: HandoffExchangeDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, role, displayName, avatarUrl } = await this.auth.exchangeLiffHandoffCode(dto.code);
    res.cookie(COOKIE_NAME, refreshToken, this.cookieOpts());
    return { accessToken, role, displayName, avatarUrl };
  }
```

Add the import at the top of the file, alongside the other DTO imports:

```typescript
import { HandoffExchangeDto } from './dto/handoff-exchange.dto';
```

- [ ] **Step 7: Type-check and run the full backend suite**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx tsc --noEmit -p tsconfig.json
npx jest
```

Expected: `tsc` exits 0. Jest shows the 4 new tests passing, with only the 2 pre-existing unrelated failures (`users.service.spec.ts`, `patients.service.spec.ts`) — no new regressions.

- [ ] **Step 8: Commit**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
git add apps/backend/src/modules/auth/auth.service.ts apps/backend/src/modules/auth/auth.controller.ts apps/backend/src/modules/auth/dto/handoff-exchange.dto.ts apps/backend/src/modules/auth/test/liff-handoff.service.spec.ts
git commit -m "feat: add LIFF-to-NextAuth session handoff code issuance and exchange"
```

---

### Task 2: Backend — link-role (guest → staff account sync)

**Files:**
- Modify: `apps/backend/src/modules/auth/auth.service.ts`
- Modify: `apps/backend/src/modules/auth/auth.controller.ts`
- Create: `apps/backend/src/modules/auth/dto/link-role.dto.ts`
- Test: `apps/backend/src/modules/auth/test/link-role.service.spec.ts`

**Interfaces:**
- Consumes: `AuthService.createLiffHandoffCode()` (Task 1).
- Produces: `AuthService.linkRole(callerId: string, email: string, password: string): Promise<{ code: string }>` — consumed by the controller and, indirectly, by Task 4's frontend "link to another account" form. `POST /auth/link-role` (JWT-guarded).

- [ ] **Step 1: Write the DTO**

Create `apps/backend/src/modules/auth/dto/link-role.dto.ts`:

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LinkRoleDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/backend/src/modules/auth/test/link-role.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SseService } from '../../notifications/sse.service';

const mockTx = {
  user: { update: jest.fn(), delete: jest.fn() },
  patient: { updateMany: jest.fn() },
  activity: { updateMany: jest.fn() },
  submission: { updateMany: jest.fn() },
};
const mockPrisma: any = {
  user: { findUnique: jest.fn() },
  $transaction: jest.fn((cb: any) => cb(mockTx)),
};
const mockJwt = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };
const mockConfig = { get: jest.fn((key: string) => (key === 'jwt.expiresIn' ? '1h' : key === 'jwt.refreshExpiresIn' ? '30d' : '')) };
const mockSse = { emit: jest.fn() };
const mockRedis = { setex: jest.fn(), get: jest.fn(), del: jest.fn() };

describe('AuthService — linkRole', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getRedisConnectionToken('default'), useValue: mockRedis },
        { provide: SseService, useValue: mockSse },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('moves the LINE link, reassigns created data, deletes the guest row, and returns a handoff code', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'guest1', role: 'GUEST', isActive: true,
        lineUserId: 'line-abc', lineDisplayName: 'Guest', linePictureUrl: 'pic.jpg',
      })
      .mockResolvedValueOnce({
        id: 'staff1', role: 'CASE_MANAGER', isActive: true,
        passwordHash: await bcrypt.hash('correct-password', 12),
      });

    const result = await service.linkRole('guest1', 'staff@example.com', 'correct-password');

    expect(result.code).toBeDefined();
    expect(mockTx.user.update).toHaveBeenCalledWith({ where: { id: 'guest1' }, data: { lineUserId: null } });
    expect(mockTx.user.update).toHaveBeenCalledWith({
      where: { id: 'staff1' },
      data: { lineUserId: 'line-abc', lineDisplayName: 'Guest', linePictureUrl: 'pic.jpg' },
    });
    expect(mockTx.patient.updateMany).toHaveBeenCalledWith({ where: { reportedById: 'guest1' }, data: { reportedById: 'staff1' } });
    expect(mockTx.activity.updateMany).toHaveBeenCalledWith({ where: { actorId: 'guest1' }, data: { actorId: 'staff1' } });
    expect(mockTx.submission.updateMany).toHaveBeenCalledWith({ where: { submittedById: 'guest1' }, data: { submittedById: 'staff1' } });
    expect(mockTx.user.delete).toHaveBeenCalledWith({ where: { id: 'guest1' } });
    expect(mockRedis.setex).toHaveBeenCalledWith(expect.stringContaining('liff-handoff:'), expect.any(Number), 'staff1');
  });

  it('rejects when the caller is not a GUEST', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'staff2', role: 'CASE_MANAGER', isActive: true });

    await expect(service.linkRole('staff2', 'staff@example.com', 'whatever1')).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an unknown target email', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: 'guest1', role: 'GUEST', isActive: true })
      .mockResolvedValueOnce(null);

    await expect(service.linkRole('guest1', 'nope@example.com', 'whatever1')).rejects.toThrow(UnauthorizedException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an incorrect password', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: 'guest1', role: 'GUEST', isActive: true })
      .mockResolvedValueOnce({ id: 'staff1', role: 'CASE_MANAGER', isActive: true, passwordHash: await bcrypt.hash('correct-password', 12) });

    await expect(service.linkRole('guest1', 'staff@example.com', 'wrong-password')).rejects.toThrow(UnauthorizedException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects linking to the caller\'s own account', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: 'guest1', role: 'GUEST', isActive: true })
      .mockResolvedValueOnce({ id: 'guest1', role: 'GUEST', isActive: true, passwordHash: await bcrypt.hash('correct-password', 12) });

    await expect(service.linkRole('guest1', 'self@example.com', 'correct-password')).rejects.toThrow(BadRequestException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx jest link-role.service.spec.ts
```

Expected: FAIL — `service.linkRole is not a function`.

- [ ] **Step 4: Implement `linkRole`**

Add this method to `apps/backend/src/modules/auth/auth.service.ts`, right after `exchangeLiffHandoffCode()` (added in Task 1):

```typescript
  async linkRole(callerId: string, email: string, password: string) {
    const caller = await this.prisma.user.findUnique({ where: { id: callerId } });
    if (!caller || caller.role !== 'GUEST') {
      throw new ForbiddenException('เฉพาะบัญชีผู้รายงานเท่านั้นที่สามารถเชื่อมต่อกับบัญชีอื่นได้');
    }

    const target = await this.prisma.user.findUnique({ where: { email } });
    if (!target || !target.isActive) throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    const valid = await bcrypt.compare(password, target.passwordHash);
    if (!valid) throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    if (target.id === caller.id) throw new BadRequestException('ไม่สามารถเชื่อมต่อกับบัญชีตัวเองได้');

    const { lineUserId, lineDisplayName, linePictureUrl } = caller;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: caller.id }, data: { lineUserId: null } });
      await tx.user.update({
        where: { id: target.id },
        data: { lineUserId, lineDisplayName, linePictureUrl },
      });
      await tx.patient.updateMany({ where: { reportedById: caller.id }, data: { reportedById: target.id } });
      await tx.activity.updateMany({ where: { actorId: caller.id }, data: { actorId: target.id } });
      await tx.submission.updateMany({ where: { submittedById: caller.id }, data: { submittedById: target.id } });
      await tx.user.delete({ where: { id: caller.id } });
    });

    return this.createLiffHandoffCode(target.id);
  }
```

Note: `lineUserId` is cleared on the caller's row inside the transaction *before* being set on the target's row, because `lineUserId` has a `@unique` constraint in the Prisma schema — both updates must happen in the same transaction to avoid a moment where two rows briefly hold conflicting state.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx jest link-role.service.spec.ts
```

Expected: all 5 tests pass.

- [ ] **Step 6: Add the controller endpoint**

Add this handler to `apps/backend/src/modules/auth/auth.controller.ts`, right after the `liffHandoffExchange()` handler added in Task 1:

```typescript
  @Post('link-role')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  linkRole(@Body() dto: LinkRoleDto, @CurrentUser() user: JwtPayload) {
    return this.auth.linkRole(user.sub, dto.email, dto.password);
  }
```

Add the import at the top of the file:

```typescript
import { LinkRoleDto } from './dto/link-role.dto';
```

- [ ] **Step 7: Type-check and run the full backend suite**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx tsc --noEmit -p tsconfig.json
npx jest
```

Expected: `tsc` exits 0. All new tests pass; only the same 2 pre-existing unrelated failures remain.

- [ ] **Step 8: Commit**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
git add apps/backend/src/modules/auth/auth.service.ts apps/backend/src/modules/auth/auth.controller.ts apps/backend/src/modules/auth/dto/link-role.dto.ts apps/backend/src/modules/auth/test/link-role.service.spec.ts
git commit -m "feat: add guest-to-staff-account link-role endpoint"
```

---

### Task 3: Frontend — NextAuth handoff-code sign-in and the handoff landing page

**Files:**
- Modify: `apps/frontend/src/lib/auth.config.ts`
- Modify: `apps/frontend/src/middleware.ts`
- Create: `apps/frontend/src/app/(auth)/guest/liff-handoff/page.tsx`

**Interfaces:**
- Consumes: `POST /auth/liff/handoff/exchange` (Task 1).
- Produces: nothing new for later tasks — this makes `signIn('credentials', { liffHandoffCode })` usable, which Task 4's link-role form and Task 6's LIFF button both call.

- [ ] **Step 1: Add the `liffHandoffCode` branch to `authorize()`**

Open `apps/frontend/src/lib/auth.config.ts`. Change:

```typescript
    CredentialsProvider({
      name: 'credentials',
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: credentials.email, password: credentials.password }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          // Extract refreshToken from the HttpOnly cookie set by the backend
          const refreshToken = res.headers.get('set-cookie')?.match(/refresh_token=([^;]+)/)?.[1];
          return { id: 'user', ...data, refreshToken };
        } catch {
          return null;
        }
      },
    }),
```

to:

```typescript
    CredentialsProvider({
      name: 'credentials',
      credentials: { email: {}, password: {}, liffHandoffCode: {} },
      async authorize(credentials) {
        if (credentials?.liffHandoffCode) {
          try {
            const res = await fetch(`${API_URL}/auth/liff/handoff/exchange`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: credentials.liffHandoffCode }),
            });
            if (!res.ok) return null;
            const data = await res.json();
            const refreshToken = res.headers.get('set-cookie')?.match(/refresh_token=([^;]+)/)?.[1];
            return { id: 'user', ...data, refreshToken };
          } catch {
            return null;
          }
        }

        if (!credentials?.email || !credentials?.password) return null;
        try {
          const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: credentials.email, password: credentials.password }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          // Extract refreshToken from the HttpOnly cookie set by the backend
          const refreshToken = res.headers.get('set-cookie')?.match(/refresh_token=([^;]+)/)?.[1];
          return { id: 'user', ...data, refreshToken };
        } catch {
          return null;
        }
      },
    }),
```

- [ ] **Step 2: Whitelist the handoff landing page in the middleware**

Open `apps/frontend/src/middleware.ts`. Change:

```typescript
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/setup') ||
    pathname.startsWith('/api-access')
  ) {
    return NextResponse.next();
  }
```

to:

```typescript
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/setup') ||
    pathname.startsWith('/api-access') ||
    pathname.startsWith('/guest/liff-handoff')
  ) {
    return NextResponse.next();
  }
```

- [ ] **Step 3: Create the handoff landing page**

Create `apps/frontend/src/app/(auth)/guest/liff-handoff/page.tsx`:

```tsx
'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Alert, Spin } from 'antd';

export default function LiffHandoffPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" /></div>}>
      <LiffHandoffContent />
    </Suspense>
  );
}

function LiffHandoffContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError('ไม่พบรหัสเข้าสู่ระบบ กรุณาเปิดจากลิงก์ใน LINE อีกครั้ง');
      return;
    }
    signIn('credentials', { liffHandoffCode: code, redirect: false }).then((result) => {
      if (result?.ok) {
        router.replace('/guest/dashboard');
      } else {
        setError('เข้าสู่ระบบไม่สำเร็จ รหัสอาจหมดอายุ กรุณาเปิดจากลิงก์ใน LINE อีกครั้ง');
      }
    });
  }, [searchParams, router]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {error ? (
        <Alert type="error" showIcon message={error} style={{ maxWidth: 400 }} />
      ) : (
        <Spin size="large" tip="กำลังเข้าสู่ระบบ..." />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend
npx tsc --noEmit -p tsconfig.json
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
git add apps/frontend/src/lib/auth.config.ts apps/frontend/src/middleware.ts "apps/frontend/src/app/(auth)/guest/liff-handoff/page.tsx"
git commit -m "feat: accept LIFF handoff codes in NextAuth and add the handoff landing page"
```

---

### Task 4: Frontend — guest profile page, hide Unlink for GUEST, add link-role form

**Files:**
- Create: `apps/frontend/src/app/(guest)/guest/profile/page.tsx`
- Modify: `apps/frontend/src/components/profile/ProfilePage.tsx`

**Interfaces:**
- Consumes: `POST /auth/link-role` (Task 2), `signIn('credentials', { liffHandoffCode })` (Task 3).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Create the guest profile page**

Create `apps/frontend/src/app/(guest)/guest/profile/page.tsx`:

```tsx
import ProfilePage from '@/components/profile/ProfilePage';

export default function GuestProfilePage() {
  return <ProfilePage />;
}
```

- [ ] **Step 2: Hide the "Unlink" button for GUEST role**

Open `apps/frontend/src/components/profile/ProfilePage.tsx`. Change:

```tsx
            <Button danger size="small" loading={unlinking} onClick={handleUnlinkLine}>Unlink</Button>
```

to:

```tsx
            {me?.role !== 'GUEST' && (
              <Button danger size="small" loading={unlinking} onClick={handleUnlinkLine}>Unlink</Button>
            )}
```

- [ ] **Step 3: Add the "link to another account" section**

Add these imports at the top of `ProfilePage.tsx`, alongside the existing ones:

```tsx
import { signIn } from 'next-auth/react';
```

Add this state, alongside the existing `useState` declarations:

```tsx
  const [linkForm] = Form.useForm();
  const [linking, setLinking] = useState(false);
```

Add this handler function, alongside the other handler functions (e.g. after `handleUnlinkLine`):

```tsx
  async function handleLinkRole(values: { email: string; password: string }) {
    setLinking(true);
    try {
      const res = await fetch(`${API}/auth/link-role`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify(values),
      });
      if (res.ok) {
        const { code } = await res.json();
        message.success('เชื่อมต่อบัญชีสำเร็จ กำลังเข้าสู่ระบบ...');
        await signIn('credentials', { liffHandoffCode: code, redirect: false });
        window.location.href = '/';
      } else {
        const err = await res.json();
        message.error(err.message ?? 'เกิดข้อผิดพลาด');
      }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setLinking(false); }
  }
```

Add this new `Card`, right after the existing "LINE Account" `Card` closes (i.e. right before the final `<Modal ...>` block):

```tsx
      {me?.role === 'GUEST' && (
        <Card
          title={<span style={{ color: '#6366F1', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>เชื่อมต่อกับบัญชีอื่น</span>}
          style={{ marginTop: 16 }}
        >
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
            หากคุณมีบัญชีเจ้าหน้าที่อยู่แล้ว กรอกอีเมลและรหัสผ่านเพื่อเชื่อมต่อบัญชีนี้เข้ากับบัญชีนั้น
          </Text>
          <Form form={linkForm} layout="vertical" onFinish={handleLinkRole}>
            <Form.Item name="email" label="อีเมล" rules={[{ required: true, type: 'email' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="password" label="รหัสผ่าน" rules={[{ required: true }]}>
              <Input.Password />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={linking} block>เชื่อมต่อบัญชี</Button>
          </Form>
        </Card>
      )}
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend
npx tsc --noEmit -p tsconfig.json
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
git add "apps/frontend/src/app/(guest)/guest/profile/page.tsx" apps/frontend/src/components/profile/ProfilePage.tsx
git commit -m "feat: add guest profile page with role-sync (link to another account)"
```

---

### Task 5: LIFF — handoff trigger on the existing "แก้ไขโปรไฟล์" button

**Files:**
- Modify: `apps/liff/src/lib/api.ts`
- Modify: `apps/liff/src/pages/HomePage.tsx`
- Modify: `apps/liff/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `POST /auth/liff/handoff` (Task 1), the existing `request()` helper and `getToken()`/`setToken()` in `apps/liff/src/lib/api.ts`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the `liffHandoff` API method**

Open `apps/liff/src/lib/api.ts`. Add this method to the `api` object, alongside `verifyLiff`/`guestRegister`:

```typescript
  liffHandoff: () =>
    request<{ code: string }>('/auth/liff/handoff', { method: 'POST' }),
```

- [ ] **Step 2: Add the `VITE_APP_URL` env var**

Open `.env.example`. In the `# ─── LIFF (Vite) ───` section, change:

```bash
VITE_API_URL=http://localhost:3001
VITE_LIFF_ID=
```

to:

```bash
VITE_API_URL=http://localhost:3001
VITE_LIFF_ID=
# Base URL of the main Next.js app, used for the guest LIFF-to-NextAuth handoff redirect
VITE_APP_URL=http://localhost:3000
```

- [ ] **Step 3: Wire the new env var through Docker**

Open `docker-compose.yml`. In the `liff_hl` service's build args, change:

```yaml
      args:
        VITE_API_URL: https://poc_hl.autratech.net/api
        VITE_LIFF_ID: ${VITE_LIFF_ID}
```

to:

```yaml
      args:
        VITE_API_URL: https://poc_hl.autratech.net/api
        VITE_LIFF_ID: ${VITE_LIFF_ID}
        VITE_APP_URL: https://poc_hl.autratech.net
```

Open `apps/liff/Dockerfile`. Change:

```dockerfile
ARG VITE_API_URL
ARG VITE_LIFF_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LIFF_ID=$VITE_LIFF_ID
```

to:

```dockerfile
ARG VITE_API_URL
ARG VITE_LIFF_ID
ARG VITE_APP_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LIFF_ID=$VITE_LIFF_ID
ENV VITE_APP_URL=$VITE_APP_URL
```

- [ ] **Step 4: Change the "แก้ไขโปรไฟล์" button to trigger the handoff**

Open `apps/liff/src/pages/HomePage.tsx`. Add this import at the top:

```tsx
import { api } from '../lib/api';
```

(Note: `api` may already need adding to the existing `import { api } from '../lib/api';` line if one exists for a different named import — check the file's current imports first and merge rather than duplicate.)

Add this handler function inside the `HomePage` component, before the `return`:

```tsx
  async function handleGoToDashboard() {
    try {
      const { code } = await api.liffHandoff();
      window.location.href = `${import.meta.env.VITE_APP_URL}/guest/liff-handoff?code=${code}`;
    } catch {
      alert('ไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่');
    }
  }
```

Change the "แก้ไขโปรไฟล์" button:

```tsx
          <button
            onClick={() => navigate('/profile')}
            style={{ flex: 1, padding: '13px', background: '#fff', border: `1.5px solid ${ACCENT}`, color: ACCENT, borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            แก้ไขโปรไฟล์
          </button>
```

to:

```tsx
          <button
            onClick={handleGoToDashboard}
            style={{ flex: 1, padding: '13px', background: '#fff', border: `1.5px solid ${ACCENT}`, color: ACCENT, borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            แก้ไขโปรไฟล์
          </button>
```

(`navigate` may now be unused in this file if nothing else calls it — check before removing the `useNavigate()` import/call, since the component may still use `navigate` elsewhere.)

- [ ] **Step 5: Type-check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/liff
npx tsc --noEmit -p tsconfig.json
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
git add apps/liff/src/lib/api.ts apps/liff/src/pages/HomePage.tsx apps/liff/Dockerfile docker-compose.yml .env.example
git commit -m "feat: trigger LIFF-to-NextAuth handoff from the existing profile button"
```

---

### Task 6: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Rebuild all affected containers**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
docker compose up -d --build backend_hl frontend_hl liff_hl
docker compose up -d nginx
```

Expected: all containers report `Built`/`Started`, no errors. Check backend logs for clean startup:

```bash
docker compose logs backend_hl --tail 20
```

Expected: no errors, server starts and logs the running-port message.

- [ ] **Step 2: Verify the handoff code flow end-to-end via curl**

This simulates what LIFF does internally, since we can't drive real LINE login via curl.

```bash
cd /Users/tae/Desktop/playground/poc_homeless

# Log in as an existing seeded GUEST-role account if one exists in the seed data,
# or use any account for a mechanical check of the code-issuing/exchange plumbing —
# check apps/backend/prisma/seed.ts for a seeded GUEST email/password first.
TOKEN=$(curl -s -X POST http://localhost:8085/auth/login -H "Content-Type: application/json" -d '{"email":"cm1@hospital.th","password":"CaseManager1!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")

# Request a handoff code
CODE=$(curl -s -X POST http://localhost:8085/auth/liff/handoff -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])")
echo "handoff code: $CODE"

# Exchange it
curl -s -X POST http://localhost:8085/auth/liff/handoff/exchange -H "Content-Type: application/json" -d "{\"code\":\"$CODE\"}" -w "\nHTTP:%{http_code}\n"

# Confirm the code is single-use — exchanging it again must fail
curl -s -o /dev/null -w "second exchange attempt: %{http_code}\n" -X POST http://localhost:8085/auth/liff/handoff/exchange -H "Content-Type: application/json" -d "{\"code\":\"$CODE\"}"
```

Expected: the first exchange returns `200` with `{accessToken, role, displayName, avatarUrl}`; the second returns `401`.

- [ ] **Step 3: Verify handoff codes expire**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
TOKEN=$(curl -s -X POST http://localhost:8085/auth/login -H "Content-Type: application/json" -d '{"email":"cm1@hospital.th","password":"CaseManager1!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
CODE=$(curl -s -X POST http://localhost:8085/auth/liff/handoff -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])")
echo "waiting 65 seconds for the code to expire..."
sleep 65
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8085/auth/liff/handoff/exchange -H "Content-Type: application/json" -d "{\"code\":\"$CODE\"}"
```

Expected: `401`.

- [ ] **Step 4: Verify link-role end-to-end via curl**

This requires an existing GUEST account. If the seed data doesn't have one, register one first via the existing (unchanged) `POST /auth/liff/guest-register` flow — but that requires a real LINE `idToken`, which can't be obtained via curl. Instead, create a throwaway GUEST user directly for this check:

```bash
cd /Users/tae/Desktop/playground/poc_homeless
docker compose exec -T postgres_hl psql -U homemed -d homemed -p 5433 -c "
INSERT INTO \"User\" (id, \"organizationId\", email, \"passwordHash\", role, \"displayName\", \"lineUserId\", \"isActive\", \"createdAt\", \"updatedAt\")
SELECT gen_random_uuid(), \"organizationId\", 'e2e-guest@example.com', 'x', 'GUEST', 'E2E Test Guest', 'e2e-line-user-id', true, now(), now()
FROM \"User\" WHERE role = 'CASE_MANAGER' LIMIT 1
RETURNING id;
"
```

Note the returned guest `id`, then get a session for it via the handoff-code path (bypassing the need for a real LINE token, since we already have a valid mechanism for turning a `userId` into tokens):

```bash
# (Requires temporarily calling createLiffHandoffCode for this test guest — the simplest
# path is to log in as SUPER_ADMIN, hit a throwaway debug route, OR — simpler — directly
# insert a Redis key mirroring what createLiffHandoffCode does, then exchange it:)
docker compose exec -T redis_hl redis-cli SET "liff-handoff:e2e-test-code" "<paste the guest id from above>" EX 60
GUEST_TOKEN=$(curl -s -X POST http://localhost:8085/auth/liff/handoff/exchange -H "Content-Type: application/json" -d '{"code":"e2e-test-code"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")

# Now call link-role as this guest, targeting the real CM account
curl -s -X POST http://localhost:8085/auth/link-role -H "Authorization: Bearer $GUEST_TOKEN" -H "Content-Type: application/json" -d '{"email":"cm1@hospital.th","password":"CaseManager1!"}' -w "\nHTTP:%{http_code}\n"
```

Expected: `200` with `{ code: "..." }`. Then confirm the guest row is gone and the CM account now carries the LINE link:

```bash
docker compose exec -T postgres_hl psql -U homemed -d homemed -p 5433 -c "SELECT email, \"lineUserId\" FROM \"User\" WHERE email IN ('e2e-guest@example.com', 'cm1@hospital.th');"
```

Expected: only one row (`cm1@hospital.th`), with `lineUserId` = `e2e-line-user-id`. Clean up afterward by unsetting the LINE link so it doesn't interfere with other testing in this environment:

```bash
docker compose exec -T postgres_hl psql -U homemed -d homemed -p 5433 -c "UPDATE \"User\" SET \"lineUserId\" = NULL WHERE email = 'cm1@hospital.th';"
```

- [ ] **Step 5: Browser check — the handoff landing page and guest dashboard**

Since real LINE login can't be driven from this environment, verify the landing page's own logic directly: obtain a fresh handoff code via Step 2's curl commands, then navigate a browser to
`http://localhost:8080/guest/liff-handoff?code=<code>` **without any existing session** (private/incognito window) and confirm it briefly shows a loading spinner, then redirects to `/guest/dashboard` (which will redirect further to `/login` if the account used isn't actually GUEST-role — for a true visual check, generate the code from a real seeded GUEST account if one exists in `apps/backend/prisma/seed.ts`, otherwise this step just confirms the redirect mechanics work for whatever role was used).

- [ ] **Step 6: Browser check — profile page and Unlink button hidden for GUEST**

Log in as a GUEST-role account (via the handoff flow or directly through NextAuth if a seeded GUEST credential exists), navigate to `/guest/profile`, and confirm: the shared profile UI renders, the "LINE Account" card shows "เชื่อมต่อแล้ว" with **no Unlink button** (since role is GUEST), and the new "เชื่อมต่อกับบัญชีอื่น" card appears with email/password fields.

- [ ] **Step 7: Report results**

No commit for this task — it's a verification checkpoint. If any step fails, go back to the relevant task and fix before considering this plan done.

---

## Self-Review Notes

- **Spec coverage:** handoff code issuance + single-use + short TTL ✓ (Task 1); NextAuth accepts the code via the existing CredentialsProvider ✓ (Task 3); new public landing page ✓ (Task 3); guest profile page reusing shared component ✓ (Task 4); Unlink hidden for GUEST ✓ (Task 4); link-role form + data reassignment + guest row deletion ✓ (Task 2 + Task 4); LIFF's HomePage/Report/field-work routes unchanged, only the profile button's destination changes ✓ (Task 5); new guest registration still lands on LIFF's HomePage unchanged ✓ (no task touches `RegisterPage.tsx`, confirmed deliberately out of scope per Global Constraints).
- **Placeholder scan:** none found — every step has complete, runnable code or an exact command. Task 6's Step 4 curl-based `link-role` verification is deliberately more involved (direct Redis/SQL manipulation) since no real LINE ID token is obtainable in this environment — that's a verification-environment limitation, not a placeholder in the feature's own code.
- **Type consistency:** `createLiffHandoffCode(userId: string): Promise<{ code: string }>` (Task 1) is called identically by `exchangeLiffHandoffCode`'s caller (the controller) and by `linkRole()`'s return statement (Task 2) — both just return its result directly. `exchangeLiffHandoffCode()`'s return shape (`{ accessToken, refreshToken, role, displayName, avatarUrl }`) matches exactly what `issueTokens()` already returns elsewhere in this file, and matches what `auth.config.ts`'s `authorize()` (Task 3) expects to receive as `data` in both its `email`/`password` and `liffHandoffCode` branches — same shape either way, so the `jwt()` callback needs no changes at all.
