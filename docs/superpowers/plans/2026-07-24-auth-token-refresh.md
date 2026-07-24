# Auth Token Refresh Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set the intended access-token (1h) / refresh-token (30d) lifetimes end-to-end (including a real bug where the refresh cookie's `maxAge` is hardcoded and ignores config), and add a redirect-to-login when the refresh token itself has failed — activating a dormant, already-written middleware file to do it.

**Architecture:** Three small, independent changes: (1) fix `AuthController`'s refresh cookie to derive its `maxAge` from the same config the Redis-side TTL already uses (currently hardcoded to 7 days — a real bug found during planning, not something in the original design spec), (2) two env var values that the token-issuance code already reads, and (3) renaming `apps/frontend/src/proxy.ts` → `apps/frontend/src/middleware.ts` (the only reason it's currently inert) with one added check. No new endpoints, no new Prisma models, no changes to the proactive-refresh logic in `auth.config.ts` — it already does the right thing once the TTLs are correct and actually reach the cookie.

**Tech Stack:** NestJS backend (JWT via `@nestjs/jwt`, refresh tokens in Redis), Next.js frontend (NextAuth JWT strategy, Next.js middleware / Edge runtime).

## Global Constraints

- Access token lifetime: 1 hour (`JWT_EXPIRES_IN=1h`).
- Refresh token lifetime: at least 1 month (`JWT_REFRESH_EXPIRES_IN=30d`) — and the cookie carrying it to the browser must actually live that long too (currently it doesn't, regardless of config).
- Refresh-token rotation stays tied to the existing per-request proactive-refresh check (triggered when the access token is within 60s of or past expiry) — not to every page navigation regardless of token state. This was explicitly confirmed with the user.
- When the refresh token has failed (expired, or invalidated by a rotation elsewhere), the user must be redirected to `/login` — enforced at the routing layer via `middleware.ts`, not just left as a silently-undefined `session.accessToken`.
- `/login`, `/setup`, and `/api/auth/*` must remain reachable without a valid session (no redirect loop).
- Activating `middleware.ts` also turns on the pre-written role-based route redirection in the same file (bare `/` → role dashboard, blocking cross-role paths) — this is an accepted, confirmed side effect, not new scope to design.

---

### Task 1: Fix the hardcoded refresh-cookie `maxAge`, then set the intended token lifetimes

**Files:**
- Modify: `apps/backend/src/modules/auth/auth.service.ts`
- Modify: `apps/backend/src/modules/auth/auth.controller.ts`
- Modify: `apps/backend/src/modules/auth/test/auth.controller.spec.ts`
- Create: `apps/backend/src/modules/auth/test/auth-token.service.spec.ts`
- Modify: `.env` (repo root)
- Modify: `.env.example` (repo root)

**Interfaces:**
- Consumes: `ConfigService` (already injected in `AuthService` as `this.config`), the existing `private parseTtl(expiry: string): number` method on `AuthService` (already returns **seconds**, supports `'d'`/`'h'`/`'m'` suffixes — used today for the Redis TTL).
- Produces: `AuthService.getRefreshCookieMaxAgeMs(): number` (public method, returns **milliseconds**) — consumed by `AuthController`'s new `cookieOpts()` helper. No other task depends on this.

**Background:** `AuthController` currently has a module-level constant:
```typescript
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};
```
`maxAge` is hardcoded to 7 days and never reads `JWT_REFRESH_EXPIRES_IN` — so even after Step 8 below changes that env var to `30d`, the browser would still drop the cookie after 7 days while the server-side Redis-stored token remained valid for 30. This task fixes that gap.

- [ ] **Step 1: Write the failing test for the new service method**

Create `apps/backend/src/modules/auth/test/auth-token.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { SseService } from '../../notifications/sse.service';

const mockConfig = { get: jest.fn() };

describe('AuthService — getRefreshCookieMaxAgeMs', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getRedisConnectionToken('default'), useValue: {} },
        { provide: SseService, useValue: { emit: jest.fn(), getSubject: jest.fn() } },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('converts a "30d" config value into milliseconds', () => {
    mockConfig.get.mockReturnValue('30d');
    expect(service.getRefreshCookieMaxAgeMs()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('converts a "1h" config value into milliseconds', () => {
    mockConfig.get.mockReturnValue('1h');
    expect(service.getRefreshCookieMaxAgeMs()).toBe(60 * 60 * 1000);
  });

  it('falls back to 7 days when config is unset', () => {
    mockConfig.get.mockReturnValue(undefined);
    expect(service.getRefreshCookieMaxAgeMs()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx jest auth-token.service.spec.ts
```

Expected: FAIL — `service.getRefreshCookieMaxAgeMs is not a function`.

- [ ] **Step 3: Implement the method**

In `apps/backend/src/modules/auth/auth.service.ts`, add this method right after the existing `private parseTtl(expiry: string): number { ... }` method (around line 208):

```typescript
  getRefreshCookieMaxAgeMs(): number {
    return this.parseTtl(this.config.get<string>('jwt.refreshExpiresIn') ?? '7d') * 1000;
  }
```

This reuses the exact same config key and fallback (`'7d'`) that `issueTokens()` already uses for the Redis-side TTL (see the existing `this.parseTtl(this.config.get<string>('jwt.refreshExpiresIn') ?? '7d')` call a few lines above it) — so the cookie and the Redis key are now guaranteed to agree.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest auth-token.service.spec.ts
```

Expected: PASS — 3/3 tests green.

- [ ] **Step 5: Wire the controller to use it, replacing the hardcoded constant**

In `apps/backend/src/modules/auth/auth.controller.ts`, replace:

```typescript
const COOKIE_NAME = 'refresh_token';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};
```

with:

```typescript
const COOKIE_NAME = 'refresh_token';
```

Then add this private method inside the `AuthController` class (right after the constructor):

```typescript
  private cookieOpts() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      maxAge: this.auth.getRefreshCookieMaxAgeMs(),
      path: '/',
    };
  }
```

Then update all three call sites that currently pass the static `COOKIE_OPTS`:
- `login()`: `res.cookie(COOKIE_NAME, refreshToken, COOKIE_OPTS);` → `res.cookie(COOKIE_NAME, refreshToken, this.cookieOpts());`
- `refresh()`: same replacement.
- `liffLink()`: same replacement.

(`logout()`'s `res.clearCookie(COOKIE_NAME)` is unaffected — it takes no options.)

- [ ] **Step 6: Update the existing controller test's mock so it doesn't break**

In `apps/backend/src/modules/auth/test/auth.controller.spec.ts`, the `mockAuthService` object currently is:

```typescript
const mockAuthService = {
  login: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  verifyLiffToken: jest.fn(),
};
```

Add the new method the controller now calls:

```typescript
const mockAuthService = {
  login: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  verifyLiffToken: jest.fn(),
  getRefreshCookieMaxAgeMs: jest.fn().mockReturnValue(30 * 24 * 60 * 60 * 1000),
};
```

- [ ] **Step 7: Run both spec files to verify nothing broke**

```bash
npx jest auth-token.service.spec.ts auth.controller.spec.ts
```

Expected: PASS — all tests green (3 from the new file + 2 pre-existing in `auth.controller.spec.ts`).

- [ ] **Step 8: Commit the code fix**

```bash
git add apps/backend/src/modules/auth/auth.service.ts apps/backend/src/modules/auth/auth.controller.ts apps/backend/src/modules/auth/test/auth-token.service.spec.ts apps/backend/src/modules/auth/test/auth.controller.spec.ts
git commit -m "fix: derive refresh-cookie maxAge from config instead of hardcoded 7 days"
```

- [ ] **Step 9: Update `.env` with the intended token lifetimes**

In `.env` (repo root), change:

```
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=7d
```

to:

```
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=30d
```

- [ ] **Step 10: Update `.env.example` to match (currently stale at `15m`/`7d`)**

In `.env.example` (repo root), change:

```
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

to:

```
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=30d
```

- [ ] **Step 11: Recreate the backend container so it picks up both the code fix and the new `.env` values**

`docker compose restart` does NOT re-read `env_file` contents or rebuild code — the container must be rebuilt and recreated:

```bash
cd /Users/tae/Desktop/playground/poc_homeless
docker compose up -d --build backend_hl
```

Expected: `Image poc_homeless-backend_hl Built`, `Container poc_homeless-backend_hl-1 Recreated`/`Started`, no errors.

- [ ] **Step 12: Verify the new access-token lifetime via a live login**

```bash
curl -s -X POST http://localhost:8085/auth/login -H "Content-Type: application/json" \
  -d '{"email":"cm1@hospital.th","password":"CaseManager1!"}' \
  | python3 -c "
import sys, json, base64, time
data = json.load(sys.stdin)
token = data['accessToken']
payload = json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '=='))
delta = payload['exp'] - time.time()
print(f'access token exp in {delta:.0f}s (expected ~3600s)')
"
```

Expected: prints something close to `3600s` (1 hour), not `604800s` (7 days).

- [ ] **Step 13: Verify the new refresh-token cookie `Max-Age` (this is the value the earlier bug prevented from ever being correct)**

```bash
curl -s -D - -o /dev/null -X POST http://localhost:8085/auth/login -H "Content-Type: application/json" \
  -d '{"email":"cm1@hospital.th","password":"CaseManager1!"}' | grep -i "set-cookie.*refresh_token"
```

Expected: the `Max-Age` attribute is `2592000` (30 days in seconds), not `604800` (7 days).

- [ ] **Step 14: Commit the config change**

```bash
git add .env .env.example
git commit -m "fix: set intended access/refresh token lifetimes (1h / 30d)"
```

---

### Task 2: Activate the dormant role/auth middleware, add refresh-failure redirect

**Files:**
- Create: `apps/frontend/src/middleware.ts`
- Delete: `apps/frontend/src/proxy.ts`

**Interfaces:**
- Consumes: `token.error` field set by the `jwt` callback in `apps/frontend/src/lib/auth.config.ts` (already exists, unchanged by this plan) — when `refreshAccessToken()` fails, it returns `{ ...token, error: 'RefreshAccessTokenError' }`, and `next-auth/jwt`'s `getToken()` decodes this field from the same signed JWT the `jwt` callback produces.
- Produces: nothing consumed by other tasks — this is the last code change in this plan.

- [ ] **Step 1: Read the current dormant file to confirm nothing has drifted since the design was written**

```bash
cat /Users/tae/Desktop/playground/poc_homeless/apps/frontend/src/proxy.ts
```

Confirm it still matches this shape (if it has diverged, adapt the following steps to the actual current content rather than blindly overwriting):

```typescript
import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

const ROLE_PREFIX: Record<string, string> = {
  SUPER_ADMIN:       'admin',
  ADMIN:             'admin',
  CASE_MANAGER:      'cm',
  CARE_GIVER:        'fw',
  MEDICAL_VOLUNTEER: 'medvol',
  DOCTOR:            'doctor',
  GUEST:             'guest',
};

export async function proxy(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/setup')
  ) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const role = (token.role as string) ?? '';
  const prefix = ROLE_PREFIX[role];
  if (!prefix) return NextResponse.redirect(new URL('/login', req.url));

  if (pathname === '/' || pathname === '/dashboard') {
    return NextResponse.redirect(new URL(`/${prefix}/dashboard`, req.url));
  }

  const otherPrefixes = Object.values(ROLE_PREFIX).filter((p) => p !== prefix);
  if (otherPrefixes.some((p) => pathname.startsWith(`/${p}/`))) {
    return NextResponse.redirect(new URL(`/${prefix}/dashboard`, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)'],
};
```

- [ ] **Step 2: Create `apps/frontend/src/middleware.ts`**

Same content as above, with the function renamed from `proxy` to `middleware` (Next.js's required export name for auto-loading), and one new check added immediately after the existing `if (!token)` check:

```typescript
import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

const ROLE_PREFIX: Record<string, string> = {
  SUPER_ADMIN:       'admin',
  ADMIN:             'admin',
  CASE_MANAGER:      'cm',
  CARE_GIVER:        'fw',
  MEDICAL_VOLUNTEER: 'medvol',
  DOCTOR:            'doctor',
  GUEST:             'guest',
};

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/setup')
  ) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (token.error === 'RefreshAccessTokenError') {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const role = (token.role as string) ?? '';
  const prefix = ROLE_PREFIX[role];
  if (!prefix) return NextResponse.redirect(new URL('/login', req.url));

  if (pathname === '/' || pathname === '/dashboard') {
    return NextResponse.redirect(new URL(`/${prefix}/dashboard`, req.url));
  }

  const otherPrefixes = Object.values(ROLE_PREFIX).filter((p) => p !== prefix);
  if (otherPrefixes.some((p) => pathname.startsWith(`/${p}/`))) {
    return NextResponse.redirect(new URL(`/${prefix}/dashboard`, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)'],
};
```

- [ ] **Step 3: Delete the now-superseded dormant file**

```bash
rm /Users/tae/Desktop/playground/poc_homeless/apps/frontend/src/proxy.ts
```

- [ ] **Step 4: Type-check the frontend**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend
npx tsc --noEmit -p tsconfig.json
```

Expected: exits 0, no errors.

- [ ] **Step 5: Rebuild the frontend container so Next.js picks up the new `middleware.ts` (middleware is compiled at build time, not picked up by a plain restart)**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
docker compose up -d --build frontend_hl
```

Expected: `Image poc_homeless-frontend_hl Built`, `Container poc_homeless-frontend_hl-1 Started`, no build errors.

- [ ] **Step 6: Confirm the middleware is now actually registered (it was silently inert before this task)**

```bash
docker compose exec frontend_hl cat .next/server/middleware-manifest.json | python3 -m json.tool
```

Expected: the `"middleware"` object is no longer empty — it should contain an entry keyed by `/` (or similar), unlike before this task where it was `{"middleware": {}, "functions": {}}`.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/middleware.ts
git rm apps/frontend/src/proxy.ts
git commit -m "feat: activate role/auth middleware, redirect to login on refresh-token failure"
```

---

### Task 3: End-to-end verification

**Files:** none (verification only).

This task has no unit-testable surface (Next.js middleware and env-driven JWT config aren't covered by this repo's existing Jest setup, which only tests NestJS services with mocked Prisma). Verification is via `curl` and container inspection against the live containers — no browser automation for the pure API/config checks, since those are HTTP status/header/Redis checks; only the final step needs a real browser.

- [ ] **Step 1: Confirm the existing proactive-refresh path still works (unchanged behavior, quick regression check) and that the refresh token rotates**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
LOGIN_HEADERS=$(mktemp)
curl -s -D "$LOGIN_HEADERS" -o /dev/null -X POST http://localhost:8085/auth/login -H "Content-Type: application/json" \
  -d '{"email":"cm1@hospital.th","password":"CaseManager1!"}'
COOKIE1=$(grep -i "set-cookie.*refresh_token" "$LOGIN_HEADERS" | sed -n 's/.*refresh_token=\([^;]*\);.*/\1/p')
echo "original refresh cookie: ${COOKIE1:0:12}..."

REFRESH_HEADERS=$(mktemp)
curl -s -D "$REFRESH_HEADERS" -o /dev/null -X POST http://localhost:8085/auth/refresh \
  -H "Cookie: refresh_token=$COOKIE1"
COOKIE2=$(grep -i "set-cookie.*refresh_token" "$REFRESH_HEADERS" | sed -n 's/.*refresh_token=\([^;]*\);.*/\1/p')
echo "rotated refresh cookie: ${COOKIE2:0:12}..."

if [ "$COOKIE1" != "$COOKIE2" ] && [ -n "$COOKIE2" ]; then
  echo "PASS: refresh token rotated on /auth/refresh"
else
  echo "FAIL: refresh token did not rotate"
fi
rm "$LOGIN_HEADERS" "$REFRESH_HEADERS"
```

Expected output: `PASS: refresh token rotated on /auth/refresh`.

- [ ] **Step 2: Confirm the OLD refresh token is invalidated after rotation (can't be reused — this was already true before this plan, just confirming no regression)**

Using `$COOKIE1` from Step 1 (already consumed once):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8085/auth/refresh -H "Cookie: refresh_token=$COOKIE1"
```

Expected: a 4xx status (the old, already-rotated-away token is rejected), not 200/201.

- [ ] **Step 3: Confirm the new middleware's refresh-failure check is actually present in the deployed bundle**

Reproducing the exact browser-side JWT `error` state via curl isn't practical (it's only ever set client-side by the `jwt` callback after a failed `/auth/refresh` call inside the NextAuth session). Instead, confirm the two building blocks that make it work: (a) Step 2 above proves `/auth/refresh` correctly rejects an invalidated refresh token — the same rejection `refreshAccessToken()` in `auth.config.ts` catches and turns into `token.error = 'RefreshAccessTokenError'`; (b) confirm the middleware's new check made it into the compiled bundle:

```bash
docker compose exec frontend_hl grep -n "RefreshAccessTokenError" .next/server/middleware.js
```

Expected: at least one match — confirms the compiled middleware bundle contains the new check (if this were accidentally dropped by a build issue, this grep would return nothing).

- [ ] **Step 4: Confirm whitelisted routes remain reachable without a valid session**

```bash
curl -s -o /dev/null -w "/login -> %{http_code}\n" http://localhost:8080/login
curl -s -o /dev/null -w "/setup -> %{http_code}\n" http://localhost:8080/setup
```

Expected: both return `200` (not a redirect loop or 500).

- [ ] **Step 5: Confirm a logged-in user's home path (`/`) now redirects to their role dashboard (the pre-existing, previously-dormant behavior that's now actually active)**

This step requires a real browser session (a NextAuth session cookie set by the frontend's own sign-in flow, not just the backend's raw JWT). Log in as `cm1@hospital.th` / `CaseManager1!` at `http://localhost:8080/login`, then navigate to `http://localhost:8080/` and confirm it redirects to `http://localhost:8080/cm/dashboard` instead of showing a 404 or blank page.

- [ ] **Step 6: Report results**

No commit for this task — it's a verification checkpoint. If any step fails, go back to the relevant task (1 or 2) and fix before considering this plan done.

---

## Self-Review Notes

- **Spec coverage:** access token = 1h ✓ (Task 1), refresh token ≥ 1 month ✓ (Task 1, 30d — and now the cookie actually reflects it, fixing a real bug the original spec didn't know about), proactive refresh on access-token expiry ✓ (already existed, verified unchanged in Task 3 Step 1), refresh-token-expiry → redirect to `/login` ✓ (Task 2's new check + Task 3 Step 3), whitelist routes stay reachable ✓ (Task 3 Step 4), role-redirect side effect confirmed acceptable and verified ✓ (Task 3 Step 5).
- **Placeholder scan:** none found — every step has a runnable command or complete file content.
- **Type consistency:** `AuthService.getRefreshCookieMaxAgeMs()` return type (number, milliseconds) matches how `AuthController.cookieOpts()` consumes it directly as `maxAge` (Express cookie `maxAge` is in milliseconds). `middleware.ts`'s exported function name (`middleware`) and `config.matcher` match Next.js's required conventions exactly as verified during design research; `token.error` field name matches exactly what `auth.config.ts`'s `refreshAccessToken()` already sets (`'RefreshAccessTokenError'`), no renaming introduced.
