# Auth Token Refresh Flow — Design

## Context

The user wants a clearer, more deliberate token lifetime policy: access tokens should last 1 hour,
refresh tokens should last at least 1 month, an expired access token should be silently replaced
via the refresh token without forcing a re-login, and once the refresh token itself expires the
user should be redirected to the login page.

Investigation found the backend and NextAuth frontend already implement almost all of this
mechanism — access/refresh token issuance, Redis-backed refresh token storage, a `/auth/refresh`
endpoint that rotates both tokens, and a NextAuth `jwt` callback that proactively refreshes 60
seconds before access-token expiry. The gaps are: (1) `.env` currently sets both token lifetimes to
`7d`, masking the intended 1h/30d split, and (2) there is no enforcement point that redirects to
`/login` once the refresh token has actually failed — a dormant file (`apps/frontend/src/proxy.ts`)
contains role-based redirect logic that looks designed for exactly this, but it was never wired up:
Next.js only auto-loads a file named `middleware.ts`, and the build's
`middleware-manifest.json` confirms zero middleware is currently active.

## Token lifetime configuration

In the root `.env` (consumed by `apps/backend/src/config/configuration.ts`):

- `JWT_EXPIRES_IN`: `7d` → `1h`
- `JWT_REFRESH_EXPIRES_IN`: `7d` → `30d`

No backend code changes — `auth.service.ts`'s `issueTokens()` already reads these via
`ConfigService` for both the JWT `expiresIn` and the Redis `refresh:{uuid}` key's TTL
(`parseTtl(...)`). Requires a backend container restart to take effect (env vars are read at
process start).

## Proactive refresh — already correct, no changes

`apps/frontend/src/lib/auth.config.ts`'s `jwt` callback, on every server-side session check:
- If the access token has more than 60 seconds left, reuses it as-is.
- Otherwise calls `POST /auth/refresh` (sending the refresh token via the `refresh_token` HttpOnly
  cookie), which — per `auth.service.ts` — deletes the old Redis-stored refresh token and issues a
  **new** access token AND a **new** refresh token (rotation, not reuse).
- On success, updates the session with the new access token; on failure, sets
  `token.error = 'RefreshAccessTokenError'` and the `session` callback clears
  `session.accessToken`.

This already satisfies "if the refresh token hasn't expired but the access token has, issue a new
access token in its place" — confirmed with the user that refresh-token rotation should stay tied
to this existing per-request check (triggered whenever the access token is near/past expiry), not
to every single page navigation regardless of token state.

## New: `middleware.ts` — redirect to `/login` when the refresh token has failed

Currently `apps/frontend/src/proxy.ts` exists with this shape but is inert (wrong filename):

```typescript
export async function proxy(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/login') || pathname.startsWith('/setup')) {
    return NextResponse.next();
  }
  if (!token) return NextResponse.redirect(new URL('/login', req.url));
  // ...role-prefix redirect logic (bare "/" -> role dashboard, block cross-role paths)
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)'] };
```

Move this to `apps/frontend/src/middleware.ts`, rename the exported function to `middleware`
(Next.js's expected export name), keep the whitelist and role-prefix logic unchanged, and add one
new check right after the existing `if (!token)` check:

```typescript
if (token.error === 'RefreshAccessTokenError') {
  return NextResponse.redirect(new URL('/login', req.url));
}
```

`getToken()` decodes the actual NextAuth JWT, which includes whatever fields the `jwt` callback
returned — including the `error` field — so this check sees the same failure state the `session`
callback already reacts to, just enforced at the routing layer instead of silently leaving the
user on a page with no valid `accessToken`.

Activating this file also turns on `proxy.ts`'s existing role-based route redirection (which was
previously dormant, not something new being designed) — confirmed with the user this is an
acceptable and expected side effect of fixing the naming issue, not scope creep.

## Verification

1. Restart the backend container after the `.env` change and confirm via a fresh login that the
   returned access token's decoded `exp` claim is ~1 hour out, and the `refresh_token` cookie's
   `Max-Age` is ~30 days.
2. Manually force an access-token expiry (e.g. temporarily set `JWT_EXPIRES_IN=10s` in a throwaway
   test run) and confirm a page navigation after 10s still works without re-login (proactive
   refresh via the `jwt` callback) and that the browser's refresh_token cookie value changes
   between requests (rotation).
3. Manually invalidate the refresh token (delete its Redis key, or wait past the cookie's
   Max-Age) and confirm the next navigation redirects to `/login` instead of showing a broken
   page or silent 401s.
4. Confirm `/login`, `/setup`, and `/api/auth/*` remain reachable without a valid session (no
   redirect loop).

## Out of scope

- The axios `api-client.ts` interceptor's `TODO` for reactive refresh-on-401 is a separate,
  pre-existing gap (most pages call `fetch()` directly, bypassing that client entirely) — not
  addressed here, since the proactive server-side refresh already covers the common case of a
  page load with a stale access token.
