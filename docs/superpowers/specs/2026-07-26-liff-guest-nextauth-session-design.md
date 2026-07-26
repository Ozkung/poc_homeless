# LIFF Guest → NextAuth Session Handoff — Design

## Context

Guests report homeless people and do field work (check-ins, notes, form submissions) through
`apps/liff/`, a separate Vite single-page app reached via a LINE chat link, entirely disconnected
from the main Next.js app (`apps/frontend/`). Today, after a guest logs in via LINE inside LIFF
(`POST /auth/liff/verify` or `POST /auth/liff/guest-register` — both already work and are
unchanged by this design), the resulting `accessToken` is held in a plain in-memory JavaScript
variable inside the LIFF SPA and never leaves it. Refreshing the LIFF page loses that token
entirely, forcing a fresh LINE re-verification every time. Meanwhile, the Next.js app already has
a `(guest)/guest/dashboard` page that expects a real NextAuth session — but nothing today can ever
reach it, so it's dead code.

This design bridges the two: after a guest completes LINE login/registration in LIFF, they are
handed off into the Next.js app with a real, persistent NextAuth session — the same
refresh-token-rotation mechanism already built for staff logins earlier this project (1h access
token, 30-day refresh token, redirect to `/login` only on refresh failure, otherwise no forced
logout). LIFF keeps doing exactly what it does today for LINE-native field actions (report a
patient, check-in, add a note, submit a form) — those are unchanged and stay in LIFF, since they
benefit from being inside LINE's own app context (camera, location).

## Flow

1. Guest opens LIFF, logs in via LINE (unchanged: `verifyLiff`/`guestRegister`).
2. **New**: immediately after that succeeds, LIFF calls a new endpoint to obtain a short-lived,
   single-use handoff code, then performs a real page navigation (not just a fetch) to the Next.js
   app carrying that code.
3. A new, public Next.js page exchanges the code for a session via NextAuth's existing
   `CredentialsProvider`, then redirects to `/guest/dashboard`.
4. The guest now has a normal, persistent session and can also visit a new `/guest/profile` page.
5. LIFF is still used for field actions during the same LINE session, using its own in-memory
   token exactly as today — unaffected by this change.

## Backend: handoff code exchange

Two new endpoints, both in the existing `auth` module, both reusing the existing `issueTokens()`
helper and Redis client already used for refresh-token storage:

- **`POST /auth/liff/handoff`** — JWT-guarded using the existing `JwtAuthGuard` (called by LIFF
  right after `verifyLiff`/`guestRegister` succeeds, passing the fresh `accessToken` it just
  received as the `Authorization: Bearer` header — LIFF already has a valid backend access token
  at this point, it just doesn't yet have a NextAuth session). Generates a random opaque code,
  stores `{ userId }` in Redis with a short TTL (~60 seconds), returns `{ code }`. LIFF redirects
  the browser to `${FRONTEND_URL}/guest/liff-handoff?code=<code>`.
- **`POST /auth/liff/handoff/exchange`** — takes `{ code }`. Looks up and immediately deletes the
  Redis entry (single-use); if missing/expired, rejects. On success, calls the existing
  `issueTokens()` for that `userId` and returns the same `{ accessToken, refreshToken, role,
  displayName, avatarUrl }` shape every other login path returns, setting the `refresh_token`
  HttpOnly cookie the same way `/auth/login` does today.

The actual session tokens are never present in a URL, browser history, or referrer header — only
the short-lived, single-use opaque code is, mirroring the standard OAuth authorization-code
pattern.

## Frontend: consuming the handoff

- **New page**: `apps/frontend/src/app/(auth)/guest/liff-handoff/page.tsx` — public (added to
  `middleware.ts`'s existing whitelist alongside `/login`, `/setup`, `/api-access`), reads `code`
  from the query string, calls `signIn('credentials', { liffHandoffCode: code, redirect: false })`,
  then routes to `/guest/dashboard` on success or shows an error and a link back to LIFF on
  failure (e.g. code expired because the guest paused too long before the redirect completed).
- **`auth.config.ts`'s existing `authorize()`** gains one branch: if `credentials.liffHandoffCode`
  is present (instead of `email`/`password`), it calls `POST /auth/liff/handoff/exchange` instead
  of `POST /auth/login`, and everything downstream (JWT callback, session shape, refresh-token
  cookie handling) is identical to the existing email+password path — no new NextAuth provider,
  just a second credential shape handled by the same one.

## Guest profile page

- **New page**: `apps/frontend/src/app/(guest)/guest/profile/page.tsx`, rendering the existing
  shared `ProfilePage` component (`apps/frontend/src/components/profile/ProfilePage.tsx`) exactly
  like every other role's profile page does — it already has a `GUEST` role label and full avatar
  support, just never wired to a route.
- **Fix**: `ProfilePage.tsx`'s "Unlink LINE" button must not be offered when the viewer's role is
  `GUEST`. Guest accounts are created with `passwordHash` set to a bcrypt hash of a random UUID
  (`AuthService.guestRegister()`) — a value the guest never knows — so unlinking LINE today would
  permanently lock a guest out with no way back in. Staff roles keep the unlink button as-is,
  since they always have a real password as a fallback.
- **New section, GUEST role only**: "เชื่อมต่อกับบัญชีอื่น" (link to another account) — an
  email + password form. On submit, calls a new authenticated endpoint:

  **`POST /auth/link-role`** (JWT-guarded — the caller's identity comes from their own valid
  session, so unlike the existing `/auth/liff/link` this does not need to re-verify a fresh LINE ID
  token). Body: `{ email, password }`. Validates the password against the target account, then:
  1. Moves `lineUserId`/`lineDisplayName`/`linePictureUrl` from the caller's (GUEST) row onto the
     target account's row (`lineUserId` is a unique column, so this is a single update once the
     source row's value is cleared).
  2. Reassigns everything the GUEST row created to the target account, so that data isn't
     orphaned: `Patient.reportedById`, `Activity.actorId`, `Submission.submittedById` — every place
     a guest's field-work actions (report a patient, check-in, add a note, submit a form) leave a
     record, per the confirmed decision to clean up rather than leave an orphaned row.
  3. Deletes the now-empty GUEST row.
  4. Returns a fresh `{ accessToken, refreshToken, role, displayName, avatarUrl }` for the target
     account (its real role, e.g. `CASE_MANAGER`), which the frontend uses to update the NextAuth
     session and redirect to that role's own dashboard.

## Session persistence

No new work: the handoff exchange issues tokens through the same `issueTokens()` path already used
by every login route, so the guest immediately gets the same 1-hour access token / 30-day refresh
token behavior, the same proactive per-request refresh, and the same "redirect to `/login` only
when the refresh token itself fails" behavior already built and verified for staff earlier this
project. "Logout only when the guest explicitly clicks Logout" falls out of this for free — it's
the existing session model, not new logic.

## Out of scope

- LIFF's own in-memory token persistence — refreshing the LIFF mini-app still re-triggers a LINE
  re-verify, which is fast and invisible to the guest since LINE's own login already persists at
  the LINE-account level (this is a pre-existing, accepted characteristic of LIFF apps generally,
  not something this feature changes).
- A "Login with LINE" button on the main staff `/login` page — a different feature from what was
  requested here.
- Any change to LIFF's field-work routes/actions (report patient, check-in, notes, forms) — these
  are unchanged.
