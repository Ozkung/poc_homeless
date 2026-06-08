# Responsive Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ทุก page ใน HomeMed Connect ใช้งานบน mobile ได้ครบ — hamburger sidebar, responsive grids, table scroll, dynamic drawer widths

**Architecture:** เพิ่ม `useIsMobile()` hook สำหรับ client components, สร้าง `AppShell.tsx` client wrapper จัดการ sidebar state, ใช้ Tailwind `md:` breakpoints สำหรับ server components ที่ไม่สามารถใช้ hook ได้ breakpoint เดียวคือ 768px

**Tech Stack:** Next.js 16 App Router, Tailwind CSS, Ant Design v6, Lucide React, TypeScript

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `apps/frontend/src/hooks/useIsMobile.ts` | Shared hook — returns true when width < 768px |
| Create | `apps/frontend/src/components/layout/AppShell.tsx` | Client wrapper — mobile header + sidebar state |
| Modify | `apps/frontend/src/app/(app)/layout.tsx` | Use AppShell instead of inline flex layout |
| Modify | `apps/frontend/src/components/layout/Sidebar.tsx` | Accept `mobileOpen`/`onMobileClose` props, render as Drawer on mobile |
| Modify | `apps/frontend/src/app/(app)/dashboard/page.tsx` | Hero row flex→col on mobile, Tailwind breakpoints |
| Modify | `apps/frontend/src/app/(app)/reports/page.tsx` | KPI grid 3→1 col on mobile |
| Modify | `apps/frontend/src/app/(app)/patients/page.tsx` | Table scroll |
| Modify | `apps/frontend/src/app/(app)/users/page.tsx` | Table scroll + Drawer width |
| Modify | `apps/frontend/src/app/(app)/inventory/page.tsx` | Table scroll + dynamic Drawer/Modal widths |
| Modify | `apps/frontend/src/app/(app)/events/page.tsx` | Calendar cell padding on mobile |

---

## Task 1: useIsMobile hook

**Files:**
- Create: `apps/frontend/src/hooks/useIsMobile.ts`

- [ ] **Step 1: Create the hook**

Create `apps/frontend/src/hooks/useIsMobile.ts`:

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

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/hooks/useIsMobile.ts
git commit -m "feat(responsive): useIsMobile hook — 768px breakpoint"
```

---

## Task 2: AppShell + Layout + Sidebar

**Files:**
- Create: `apps/frontend/src/components/layout/AppShell.tsx`
- Modify: `apps/frontend/src/app/(app)/layout.tsx`
- Modify: `apps/frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Read current Sidebar.tsx**

Read `apps/frontend/src/components/layout/Sidebar.tsx` so you understand its current structure before modifying it.

- [ ] **Step 2: Create AppShell.tsx**

Create `apps/frontend/src/components/layout/AppShell.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import { useIsMobile } from '@/hooks/useIsMobile';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={`${isMobile ? 'flex flex-col h-screen bg-[#f0f2f5]' : 'flex h-screen bg-[#f0f2f5]'}`}>
      {/* Mobile header */}
      {isMobile && (
        <header style={{
          height: 56, background: '#fff', borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
          flexShrink: 0, position: 'sticky', top: 0, zIndex: 100,
        }}>
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
            aria-label="เปิดเมนู"
          >
            <Menu size={22} color="#111" />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 6, background: '#1677ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 8, color: '#1677ff', letterSpacing: 2, textTransform: 'uppercase', lineHeight: 1 }}>HomeMed</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#111', lineHeight: 1 }}>Connect</div>
            </div>
          </div>
        </header>
      )}

      {/* Sidebar — desktop: always visible, mobile: overlay Drawer */}
      <Sidebar
        mobileOpen={isMobile ? sidebarOpen : undefined}
        onMobileClose={isMobile ? () => setSidebarOpen(false) : undefined}
      />

      {/* Main content */}
      <main className={`flex-1 overflow-y-auto ${isMobile ? 'p-4' : 'p-7'}`}>
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Update layout.tsx**

Replace the entire content of `apps/frontend/src/app/(app)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import AntdProvider from '@/components/AntdProvider';
import SessionProvider from '@/components/SessionProvider';
import AppShell from '@/components/layout/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return (
    <SessionProvider>
      <AntdProvider>
        <AppShell>{children}</AppShell>
      </AntdProvider>
    </SessionProvider>
  );
}
```

- [ ] **Step 4: Update Sidebar.tsx — add mobileOpen/onMobileClose props**

Modify `apps/frontend/src/components/layout/Sidebar.tsx`. Add these prop types and drawer behavior.

Add to the import line — add `Drawer` from antd:
```tsx
import { Menu, Button, Avatar, Typography, Drawer } from 'antd';
```

Add prop interface at the top of the file (before the component):
```tsx
interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}
```

Change the component signature:
```tsx
export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
```

In the `onClick` handler of the nav Menu, call `onMobileClose?.()` after navigating:
```tsx
onClick={({ key }) => { router.push(key); onMobileClose?.(); }}
```

In the user footer's profile click, also call `onMobileClose?.()`:
```tsx
onClick={() => { router.push('/profile'); onMobileClose?.(); }}
```

Wrap the existing `<aside>...</aside>` JSX with a condition. The final return should be:

```tsx
  const sidebarContent = (
    <>
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: '#1677ff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', lineHeight: 1, marginBottom: 2 }}>HomeMed</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#111', lineHeight: 1 }}>Connect</div>
        </div>
      </div>

      {/* Navigation */}
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={navItems}
        onClick={({ key }) => { router.push(key); onMobileClose?.(); }}
        style={{ flex: 1, border: 'none', paddingTop: 8 }}
      />

      {/* User footer */}
      <div style={{ padding: 12, borderTop: '1px solid #f5f5f5' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#fafafa', borderRadius: 8, marginBottom: 8, cursor: 'pointer' }}
          onClick={() => { router.push('/profile'); onMobileClose?.(); }}
        >
          <Avatar size={28} style={{ background: '#1677ff', fontSize: 11, fontWeight: 700 }}>
            {initials}
          </Avatar>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: 600, display: 'block' }} ellipsis>{userName}</Text>
            <Text style={{ fontSize: 10, color: '#bbb' }}>{role || 'USER'}</Text>
          </div>
          <UserCircle size={14} style={{ color: '#bbb', flexShrink: 0 }} />
        </div>
        <Button
          block size="small"
          icon={<LogOut size={12} />}
          onClick={() => signOut({ callbackUrl: '/login' })}
          style={{ fontSize: 12 }}
        >
          ออกจากระบบ
        </Button>
      </div>
    </>
  );

  // Mobile: render as overlay Drawer
  if (mobileOpen !== undefined) {
    return (
      <Drawer
        placement="left"
        open={mobileOpen}
        onClose={onMobileClose}
        width={260}
        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' } }}
        closable={false}
      >
        {sidebarContent}
      </Drawer>
    );
  }

  // Desktop: render as fixed aside
  return (
    <aside style={{
      width: 220, background: '#fff', borderRight: '1px solid #f0f0f0',
      display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0,
    }}>
      {sidebarContent}
    </aside>
  );
```

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors

- [ ] **Step 6: Build check**

```bash
npm run build 2>&1 | grep -E "error|✓ Compiled" | head -5
```

Expected: `✓ Compiled successfully`

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/components/layout/AppShell.tsx \
        apps/frontend/src/app/\(app\)/layout.tsx \
        apps/frontend/src/components/layout/Sidebar.tsx
git commit -m "feat(responsive): AppShell + hamburger sidebar Drawer on mobile"
```

---

## Task 3: Dashboard responsive

**Files:**
- Modify: `apps/frontend/src/app/(app)/dashboard/page.tsx`

Dashboard is a **server component** — cannot use `useIsMobile()`. ใช้ Tailwind responsive classes แทน.

- [ ] **Step 1: Read the current dashboard page**

Read `apps/frontend/src/app/(app)/dashboard/page.tsx` to understand the exact hero section structure (lines 105–193).

- [ ] **Step 2: Replace hero bento row**

Find the hero section (starts at `{/* Bento grid */}`). Replace the outer `<div>` and the two inner children (the 70% Card and the 30% div) with Tailwind-based responsive layout.

Replace:
```tsx
      {/* Bento grid */}
      <div style={{ display: 'flex', gap: 14 }}>

        {/* Hero card — 2 cols × 2 rows */}
        <Card
          style={{ gridColumn: 'span 2', gridRow: 'span 2', borderTop: '3px solid #1677ff', width: '70%' }}
```

With:
```tsx
      {/* Bento grid */}
      <div className="flex flex-col md:flex-row gap-4">

        {/* Hero card */}
        <Card
          className="w-full md:w-[70%]"
          style={{ borderTop: '3px solid #1677ff' }}
```

Replace the stat cards column wrapper:
```tsx
        <div style={{ display: 'flex', flexDirection: 'column',justifyContent: 'space-between', gap: 14, width: '30%' }}>
```
With:
```tsx
        <div className="flex flex-col justify-between gap-4 w-full md:w-[30%]">
```

Replace the AgeCluster card (remove `gridColumn: 'span 3'` which has no effect in flex context):
```tsx
      <Card
        style={{ gridColumn: 'span 3', borderTop: '3px solid #722ed1', marginTop: 14 }}
```
With:
```tsx
      <Card
        style={{ borderTop: '3px solid #722ed1', marginTop: 14 }}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/\(app\)/dashboard/page.tsx
git commit -m "feat(responsive): dashboard hero row stacks on mobile"
```

---

## Task 4: Reports responsive

**Files:**
- Modify: `apps/frontend/src/app/(app)/reports/page.tsx`

Reports is a **server component** — ใช้ Tailwind classes.

- [ ] **Step 1: Replace KPI grid style**

Find the KPI cards div (contains `gridTemplateColumns: 'repeat(3,1fr)'`). Replace:

```tsx
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
```

With:

```tsx
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/\(app\)/reports/page.tsx
git commit -m "feat(responsive): reports KPI cards stack to 1 column on mobile"
```

---

## Task 5: Patients + Users pages

**Files:**
- Modify: `apps/frontend/src/app/(app)/patients/page.tsx`
- Modify: `apps/frontend/src/app/(app)/users/page.tsx`

- [ ] **Step 1: Add scroll to Patients table**

In `apps/frontend/src/app/(app)/patients/page.tsx`, find the `<Table` component and add `scroll={{ x: 600 }}`:

```tsx
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          size="middle"
          scroll={{ x: 600 }}
```

- [ ] **Step 2: Add useIsMobile + dynamic Drawer width to Users page**

In `apps/frontend/src/app/(app)/users/page.tsx`:

Add import at top:
```tsx
import { useIsMobile } from '@/hooks/useIsMobile';
```

Add hook inside the component (after other hook calls):
```tsx
  const isMobile = useIsMobile();
```

Add `scroll={{ x: 600 }}` to the `<Table` component:
```tsx
        <Table columns={columns} dataSource={users} rowKey="id" loading={loading} size="middle" pagination={{ pageSize: 20 }} scroll={{ x: 600 }} />
```

Change the Drawer `styles` prop to use dynamic width:
```tsx
      <Drawer
        title={editing ? `แก้ไข: ${editing.displayName}` : 'เพิ่ม User ใหม่'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ wrapper: { width: isMobile ? '100%' : 420 } }}
      >
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/\(app\)/patients/page.tsx \
        apps/frontend/src/app/\(app\)/users/page.tsx
git commit -m "feat(responsive): patients + users tables scroll, users drawer full-width on mobile"
```

---

## Task 6: Inventory page

**Files:**
- Modify: `apps/frontend/src/app/(app)/inventory/page.tsx`

Inventory has 3 Drawers (Stock-in width=400, Transaction History width=640) and 1 Modal (ExpiringLots width=700). All need dynamic widths on mobile.

- [ ] **Step 1: Add useIsMobile hook**

In `apps/frontend/src/app/(app)/inventory/page.tsx`, add import:
```tsx
import { useIsMobile } from '@/hooks/useIsMobile';
```

Add hook inside component:
```tsx
  const isMobile = useIsMobile();
```

- [ ] **Step 2: Add scroll to main inventory Table**

Find the main `<Table` with `columns={columns}` and add scroll:
```tsx
          <Table
            columns={columns} dataSource={filtered} rowKey="id"
            loading={loading} size="middle"
            scroll={{ x: 600 }}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            locale={{ emptyText: 'ยังไม่มีรายการ' }}
            rowClassName={(r) => r.currentStock <= r.lowStockThreshold ? 'bg-red-50' : ''}
          />
```

- [ ] **Step 3: Update Stock-in Drawer width**

Find `<Drawer title={\`รับเข้า: ${selectedItem?.name}\`}` and change `styles`:
```tsx
      <Drawer title={`รับเข้า: ${selectedItem?.name}`} open={stockInOpen}
        onClose={() => { setStockInOpen(false); stockInForm.resetFields(); }}
        styles={{ wrapper: { width: isMobile ? '100%' : 400 } }}>
```

- [ ] **Step 4: Update ExpiringLots Modal width**

Find `<Modal` with `width={700}` (ExpiringLotsModal) and change to:
```tsx
      <Modal
        title={...}
        open={expiryModalOpen}
        onCancel={() => setExpiryModalOpen(false)}
        footer={null}
        width={isMobile ? undefined : 700}
        style={isMobile ? { top: 0, maxWidth: '100vw', margin: 0, padding: 0 } : undefined}
      >
```

- [ ] **Step 5: Update Transaction History Drawer width**

Find `<Drawer` with `width={640}` and change to:
```tsx
      <Drawer
        title={`ประวัติรายการ: ${txItem?.name}`}
        open={txOpen}
        onClose={() => setTxOpen(false)}
        width={isMobile ? '100%' : 640}
      >
```

- [ ] **Step 6: TypeScript check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/app/\(app\)/inventory/page.tsx
git commit -m "feat(responsive): inventory table scroll + dynamic drawer widths on mobile"
```

---

## Task 7: Events calendar

**Files:**
- Modify: `apps/frontend/src/app/(app)/events/page.tsx`

- [ ] **Step 1: Add useIsMobile hook**

In `apps/frontend/src/app/(app)/events/page.tsx`, add import:
```tsx
import { useIsMobile } from '@/hooks/useIsMobile';
```

Add hook inside component (after other hooks):
```tsx
  const isMobile = useIsMobile();
```

- [ ] **Step 2: Make day-header cells smaller on mobile**

Find the day headers div (`{/* Day headers */}`). Change the inner style to use dynamic padding and font-size:

```tsx
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid #f0f0f0' }}>
          {THAI_DAY_NAMES.map((day) => (
            <div key={day} style={{
              padding: isMobile ? '6px 0' : '8px 0', textAlign: 'center',
              fontFamily: "'Sarabun',sans-serif",
              fontSize: isMobile ? 9 : 11,
              color: '#aaa', textTransform: 'uppercase', letterSpacing: 1,
            }}>
              {isMobile ? day.slice(0, 2) : day}
            </div>
          ))}
        </div>
```

- [ ] **Step 3: Make day cells smaller on mobile**

Find the day cell `<button>` inside `{daysInMonth.map(...)}`. Change `minHeight` and `padding` to dynamic:

```tsx
                style={{
                  minHeight: isMobile ? 48 : 80,
                  borderBottom: '1px solid #f5f5f5',
                  borderRight: '1px solid #f5f5f5',
                  padding: isMobile ? 4 : 8,
```

- [ ] **Step 4: Make event Drawer full-width on mobile**

Find the event Drawer near bottom of file (`width={400}`). Change to:
```tsx
        width={isMobile ? '100%' : 400}
```

- [ ] **Step 5: TypeScript check + build**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend && npx tsc --noEmit 2>&1 | head -5 && npm run build 2>&1 | grep -E "error|✓ Compiled" | head -5
```

Expected: no TS errors, `✓ Compiled successfully`

- [ ] **Step 6: Commit + push**

```bash
git add apps/frontend/src/app/\(app\)/events/page.tsx
git commit -m "feat(responsive): events calendar smaller cells + full-width drawer on mobile"
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ `useIsMobile` hook (< 768px) → Task 1
- ✅ `AppShell` client wrapper with mobile header → Task 2
- ✅ Sidebar hamburger → antd Drawer overlay → Task 2
- ✅ Auto-close sidebar on nav click → Task 2
- ✅ Main padding `p-7` → `p-4` on mobile → Task 2 (AppShell)
- ✅ Dashboard hero row flex→col on mobile → Task 3
- ✅ Reports KPI grid 3→1 col → Task 4
- ✅ Tables: `scroll={{ x: 600 }}` on Patients, Users, Inventory → Tasks 5, 6
- ✅ Drawer widths dynamic (100% on mobile) → Tasks 5, 6, 7
- ✅ Events calendar smaller cells on mobile → Task 7
- ✅ Profile page: no change needed (already maxWidth 600, auto margin) → covered by spec note
