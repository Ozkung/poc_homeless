# Login Page Redesign Spec
**Date:** 2026-06-07  
**Status:** Approved

---

## Overview

Redesign the HomeMed Connect login page to use Ant Design components and match the antd Light theme used throughout the rest of the app. Replace the current dark Tailwind card with a centered antd card on a light gray background.

---

## Design Decisions

| Decision | Choice |
|----------|--------|
| Layout | Centered card on `#f0f2f5` background |
| Component library | antd (already installed in the project) |
| Theme | antd Light — consistent with dashboard |
| Primary color | `#1677ff` (antd default blue) |
| Card width | `max-w-[400px]` |

---

## Card Structure

```
┌─────────────────────────────────┐
│  🏥  HomeMed  (eyebrow)         │
│      Connect  (brand name)      │
├─────────────────────────────────┤
│  เข้าสู่ระบบ  (heading)         │
│  ระบบดูแลผู้ป่วยไร้บ้าน (sub)  │
│                                 │
│  [Error alert — when failed]    │
│                                 │
│  EMAIL label                    │
│  [antd Input]                   │
│                                 │
│  PASSWORD label  ลืมรหัสผ่าน?  │
│  [antd Input.Password]          │
│                                 │
│  [antd Button type="primary"]   │
│          เข้าสู่ระบบ           │
├─────────────────────────────────┤
│  v1.0  ·  CASE_MANAGER badge    │
└─────────────────────────────────┘
```

---

## Component Spec

### Page wrapper
- Full-screen: `min-h-screen`, background `#f0f2f5`
- Subtle dot grid background pattern via CSS `radial-gradient`
- Flex center (horizontal + vertical)

### antd Card
- `border-radius: 16px`
- `padding: 36px 40px 32px`
- `max-width: 400px`, `width: 100%`
- `box-shadow: 0 8px 40px rgba(0,0,0,.10)`

### Brand mark (top of card)
- Row: blue square icon (`#1677ff` bg, 40×40px, 10px radius, 🏥 emoji) + text column
- Eyebrow: `JetBrains Mono`, 9px, `#1677ff`, uppercase, letter-spacing 2.5px — "HomeMed"
- Name: `Syne`, 20px, weight 800, `#111` — "Connect"
- Horizontal rule (1px `#f5f5f5`) below brand row, negative margin to touch card edges

### Form heading
- "เข้าสู่ระบบ" — `Syne`, 15px, weight 700
- "ระบบดูแลผู้ป่วยไร้บ้านในชุมชน" — 12px, `#aaa`

### Error state
- antd `Alert` component: `type="error"`, `showIcon`, message "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
- Shown only when `error` state is set after failed `signIn`

### Fields
- Labels: `JetBrains Mono`, 10px, uppercase, `#aaa`, letter-spacing 1.5px
- Email: `antd Input`, placeholder "cm@hospital.th"
- Password row header: flex row — label left, "ลืมรหัสผ่าน?" link right (antd `Typography.Link`, 11px)
- Password: `antd Input.Password` (shows toggle eye icon)

### Submit button
- antd `Button type="primary"`, `block`, `size="large"`
- Default text: "เข้าสู่ระบบ"
- Loading state: `loading={true}` prop — antd shows spinner automatically, text "กำลังเข้าสู่ระบบ..."

### Card footer
- Border-top `#f5f5f5`, `margin-top: 20px`, `padding-top: 16px`
- Centered row: "v1.0 ·" in `#ccc` mono text + antd `Tag` "CASE_MANAGER" in blue

---

## Behaviour

- `'use client'` component — same as current (uses `signIn` from next-auth/react)
- On submit: call `signIn('credentials', { email, password, redirect: false })`
- On success: `router.replace('/dashboard')`
- On failure: set error state → show `Alert`
- Loading state: button `loading` prop set during the async `signIn` call
- "ลืมรหัสผ่าน?" link: no-op for now (`href="#"`) — placeholder for future feature

---

## What Does NOT Change

- NextAuth wiring (`signIn`, `useRouter`) — unchanged
- Route: still `app/(auth)/login/page.tsx`
- No `AntdProvider` needed — `AntdRegistry` in root layout is sufficient; `ConfigProvider` token (blue primary) inherited automatically
