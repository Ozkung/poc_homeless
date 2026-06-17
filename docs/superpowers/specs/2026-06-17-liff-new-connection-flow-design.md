# LIFF New Connection Flow — Design Spec

**Date:** 2026-06-17

## Overview

Redesign the LIFF onboarding flow so that LINE login completes first, then the user registers or links their account through dedicated pages. Removes the auto-redirect to `/auth` on unlinked accounts and replaces it with a direct Guest Register page (`/welcome`). Account linking is accessible from the Profile page.

---

## Current Flow (before)

```
LIFF open → LINE login → verifyLiff
  → linked   → Task page
  → not linked → redirect /auth (choice: register or link) → TOU → done
```

## New Flow (after)

```
LIFF open → LINE login → verifyLiff
  → linked   → Task page (unchanged)
  → not linked → redirect /welcome → Guest Register form → TOU → done → Profile page
                                    ↕ (link "มีบัญชีอยู่แล้ว?")
                                    /auth → Link form (email+pw) → TOU → Profile page

Profile page (GUEST role) → ปุ่ม "เชื่อมบัญชีที่มีอยู่" → /auth
```

---

## Architecture

### Route Map

| Route | Component | Purpose |
|---|---|---|
| `/` | TaskPage | Task list for linked users (unchanged) |
| `/welcome` | WelcomePage | Guest Register form for unlinked LINE users |
| `/auth` | AuthPage | Link existing account (email + password) |
| `/profile` | ProfilePage | User profile + link button for GUEST role |

### Files Changed

| File | Change |
|---|---|
| `src/main.tsx` | Redirect unlinked users to `/welcome` instead of `/auth` |
| `src/pages/WelcomePage.tsx` | **New** — 3-step: register form → TOU → done |
| `src/pages/AuthPage.tsx` | Reduce to link-only flow (remove ChoiceStep, RegisterStep, DoneStep) |
| `src/pages/ProfilePage.tsx` | Add "เชื่อมบัญชีที่มีอยู่" button for GUEST role |

---

## Section 1: main.tsx

**Logic change:**
```
initLiff() → liff.login() if not logged in
→ verifyLiff(idToken)
  → success       → setToken → setReady(true)
  → 401/not linked → navigate('/welcome')   ← changed from '/auth'
  → other error   → show error screen
```

No other changes to `main.tsx`.

---

## Section 2: WelcomePage (New)

**File:** `src/pages/WelcomePage.tsx`

**State machine:**
```
[register-form] → [tou] → [done]
```

**Header (all steps):**
- LINE profile picture from `liff.getProfile()`
- LINE display name
- Subtitle: "ยินดีต้อนรับสู่โครงการ"

**Register Form step:**
- Fields: ชื่อ* (firstName), นามสกุล* (lastName), อีเมล* (email), เบอร์โทรศัพท์ (phone), Zone dropdown (from `api.getPublicZones()`)
- Small link at bottom: "มีบัญชีในระบบอยู่แล้ว? เชื่อมบัญชี →" → `navigate('/auth')`
- Submit → collect form data → go to TOU step

**TOU step:**
- Full Terms + Privacy text (same content as current AuthPage)
- Scroll-to-bottom gate before checkbox enables
- Checkbox: "ข้าพเจ้ายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัว"
- Confirm button → `POST /auth/liff/guest-register` → `setToken(accessToken)` → go to Done step

**Done step:**
- LINE profile picture + name
- Role badge: "อาสาสมัคร (รออนุมัติ)" (amber)
- Button "ดูโปรไฟล์" → `navigate('/profile', { replace: true })`

**Error handling:**
- API error → show inline error message, return to register-form step

---

## Section 3: AuthPage (Reduced Scope)

**File:** `src/pages/AuthPage.tsx`

Remove: `ChoiceStep`, `RegisterStep`, `DoneStep`, `Step` type variants for those steps.

**Remaining state machine:**
```
[link-form] → [tou] → navigate('/profile')
```

**Link Form step:**
- Title: "เชื่อมต่อบัญชี"
- Subtitle: "ใส่ email และรหัสผ่านของบัญชีที่มีอยู่ในระบบ"
- Fields: อีเมล*, รหัสผ่าน*
- Small link at bottom: "← ยังไม่มีบัญชี? กลับไปสมัคร" → `navigate('/welcome')`
- Submit → collect form data → go to TOU step

**TOU step:**
- Same as WelcomePage TOU
- Confirm → `POST /auth/liff/link` → `setToken(accessToken)` → `navigate('/profile', { replace: true })`

**Error handling:**
- 401: "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
- 409: "LINE Account นี้ผูกกับบัญชีอื่นอยู่แล้ว"
- 403: "บัญชีนี้ไม่รองรับการผูก LINE"

---

## Section 4: ProfilePage (Addition)

**File:** `src/pages/ProfilePage.tsx`

**Add logic:** After loading JWT payload, check `role === 'GUEST'`.

If GUEST, render an additional card below the info section:
```
┌─────────────────────────────────────┐
│ 🔗 มีบัญชีในระบบอยู่แล้วใช่ไหม?    │
│    กดเพื่อเชื่อมบัญชีและอัปเกรด Role │
│                                     │
│  [ เชื่อมบัญชีที่มีอยู่ ]            │
└─────────────────────────────────────┘
```
- Button → `navigate('/auth')`
- Card background: `#fffbeb` (amber-50), border: `#fcd34d`

If role is anything other than GUEST → do not render this card.

---

## Shared: TOU Content

The TOU text is duplicated between WelcomePage and AuthPage. Both pages hardcode the same Thai text. No shared component is needed given the simplicity — just copy the constant.

---

## Out of Scope

- Backend changes (existing `/auth/liff/guest-register` and `/auth/liff/link` endpoints are unchanged)
- Rich Menu configuration
- SSE notifications (already implemented)
- Password reset from LIFF
