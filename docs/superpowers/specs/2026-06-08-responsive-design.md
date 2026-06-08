# Responsive Design — Spec

**Date:** 2026-06-08
**Scope:** ทำให้ HomeMed Connect ใช้งานบน mobile ได้ครบทุก role — breakpoint 768px, hamburger menu สำหรับ Sidebar, grid layouts stack เป็น 1 column บน mobile

---

## 1. Breakpoint

| State | Width |
|-------|-------|
| Mobile | < 768px |
| Desktop | ≥ 768px |

ทุกจุดในโปรเจกต์ใช้ breakpoint เดียวนี้ ไม่มี intermediate tablet breakpoint

---

## 2. Infrastructure

### 2.1 `useIsMobile` hook

**File:** `apps/frontend/src/hooks/useIsMobile.ts`

```typescript
'use client';
import { useEffect, useState } from 'react';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
```

ทุก component ที่ต้องการ responsive behavior ดึง hook นี้ได้เลย

### 2.2 App Layout (`layout.tsx`)

**Desktop (≥ 768px):** ไม่เปลี่ยน — `flex h-screen`, Sidebar + main

**Mobile (< 768px):**
- ซ่อน Sidebar ออกจาก layout
- เพิ่ม fixed header bar ด้านบน (height 56px) ประกอบด้วย:
  - ปุ่ม hamburger (Lucide `Menu` icon) ซ้าย
  - Logo "HomeMed Connect" กลาง
- `<main>` เต็ม width, padding `p-4` (ลดจาก `p-7`)
- Manage `sidebarOpen: boolean` state ใน layout, ส่งลง Sidebar และ header

### 2.3 Sidebar (`Sidebar.tsx`)

**Desktop:** render ปกติ — `<aside>` width 220px, border right

**Mobile:** render เป็น antd `<Drawer placement="left" width={280} open={sidebarOpen} onClose={closeSidebar}>`
- เมื่อกด nav item: `router.push(key)` แล้ว `closeSidebar()` ทันที
- Drawer ไม่มี header title — content เหมือน desktop (logo + menu + user footer)

---

## 3. Content Pages

### 3.1 Dashboard (`dashboard/page.tsx`)

**Hero section** — flex row ที่มี chart (70%) + stat cards (30%):
- Mobile: `flexDirection: 'column'`, ทั้งสองส่วน width 100%

**Bento grid:**
- Desktop: `gridTemplateColumns: 'repeat(3, 1fr)'`
- Mobile: single column ผ่าน `className="grid grid-cols-1 md:grid-cols-3"`
- Items ที่มี `gridColumn: 'span 2'` → span 1 บน mobile

### 3.2 Reports (`reports/page.tsx`)

**KPI Cards:**
- Desktop: `gridTemplateColumns: 'repeat(3,1fr)'`
- Mobile: `className="grid grid-cols-1 md:grid-cols-3"`

### 3.3 Tables (Patients, Users, Inventory)

เพิ่ม `scroll={{ x: 600 }}` บน antd `<Table>` ทุกตัว → horizontal scroll บน mobile แทน wrap

**Inventory page:** Drawer `width` เปลี่ยนเป็น dynamic:
```tsx
const { width } = isMobile ? { width: '100%' } : { width: 420 };
```
ใช้กับ Stock-in Drawer, ADJ Modal, Transaction History Drawer, ExpiringLotsModal

### 3.4 Events (`events/page.tsx`)

Calendar custom grid — เพิ่ม responsive padding ให้ cell เล็กลงบน mobile ผ่าน Tailwind:
- Cell padding: `p-1 md:p-2`
- Day label font-size: `text-xs md:text-sm`

### 3.5 Profile (`profile/page.tsx`)

`maxWidth: 600, margin: '0 auto'` — ทำงานได้ดีแล้วบน mobile ไม่ต้องเปลี่ยน

### 3.6 Users, Inventory Approvals

antd Table → เพิ่ม `scroll={{ x: 600 }}` เท่านั้น

---

## 4. Tailwind Config

ตรวจสอบว่า `tailwind.config.ts` มี content path ครอบคลุม `.tsx` ใน `src/` — ถ้าไม่มีต้องเพิ่ม

---

## 5. ขอบเขต (Out of Scope)

- LIFF app (แยก Vite SPA, มี responsive เฉพาะของตัวเอง)
- Login page (ไม่อยู่ใน app layout)
- Tablet-specific layout (intermediate breakpoint)
- Touch gestures (swipe to open sidebar)
