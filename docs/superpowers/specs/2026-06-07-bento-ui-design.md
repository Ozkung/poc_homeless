# HomeMed Connect — Bento UI Design Spec
**Date:** 2026-06-07  
**Status:** Approved

---

## Overview

Redesign the HomeMed Connect CM Dashboard frontend with Ant Design (antd) as the component library and a full bento grid layout. The goal is a data-dense, modern interface where the logged-in Case Manager sees their own patients, events, and tasks at a glance.

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UI library | Ant Design (`antd`) | Rich component set, Thai-friendly, replaces ad-hoc Tailwind widgets |
| Theme | antd Light (default) | Clean, clinical feel appropriate for medical context |
| Primary color | `#1677ff` (antd default blue) | Standard antd token; replaces existing purple brand in UI components |
| Layout | Full bento — 3-column CSS Grid, mixed card sizes | Maximum data density, true bento hierarchy |
| Data scope | Logged-in CM only | Dashboard shows only the current user's patients, events, tasks |

---

## Design System

### Colors (antd token overrides)

```ts
theme: {
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 12,
    fontFamily: "'Sarabun', system-ui, sans-serif",
  }
}
```

Status colors map to antd semantic tokens:
- CRITICAL → `colorError` (`#ff4d4f`)
- PENDING → `colorWarning` (`#faad14`)
- STABLE → `colorSuccess` (`#52c41a`)

### Typography

| Role | Font | Usage |
|------|------|-------|
| Page titles, stat numbers | Syne (existing) | `font-display` className kept |
| Labels, codes, HN | JetBrains Mono (existing) | `font-mono` className kept |
| Body / Thai text | Sarabun (existing) | antd `fontFamily` token override |

### Bento Grid

Built with CSS Grid (not antd Row/Col) for precise spanning control:

```css
display: grid;
grid-template-columns: repeat(3, 1fr);
gap: 14px;
```

antd `Card` components fill each grid cell. Card variants:
- `span2` — `grid-column: span 2`
- `span3` — `grid-column: span 3` (full-width)
- `row2` — `grid-row: span 2` (tall card)

---

## Pages to Redesign

### 1. Dashboard (`/dashboard`)

Bento grid layout (approved mockup):

| Cell | Size | Content |
|------|------|---------|
| Hero patient card | 2×2 | Total patients, progress bar, status tag breakdown, recent 5 patients list |
| Critical count | 1×1 | `Statistic` with red accent line, critical subcount |
| Events this month | 1×1 | `Statistic` + mini 7-col calendar with event dots |
| Activity feed | 3×1 (full-width) | 3-column grid of CM's recent events — check-ins, assignments, notes |

The activity feed shows only the **logged-in CM's** activities via `GET /patients/:id/activities` aggregated across their patients.

### 2. Patients List (`/patients`)

- Replace Tailwind table with antd `Table` component
- `Input.Search` for name/HN search
- antd `Segmented` control for status filter (ALL / CRITICAL / PENDING / STABLE)
- `Tag` components for status badges
- Row click navigates to profile

### 3. Patient Profile (`/patients/[id]`)

- antd `Descriptions` component for demographics (HN, age, gender, location)
- antd `Tag` for each condition
- antd `Timeline` component for activities (replaces custom timeline)
- antd `List` for form submissions
- Status `Badge` in page header

### 4. Events / Planning (`/events`)

- Keep custom calendar grid (no fullcalendar dep)
- Replace side panel cards with antd `Card` + `Descriptions` for event detail
- antd `Badge` for priority indicators on calendar day cells
- antd `Drawer` component for event detail instead of inline panel

### 5. Forms (`/forms`)

- antd `Table` for forms list
- antd `Button` for create/edit/delete actions
- Keep existing dnd-kit form builder canvas — wrap field items in antd `Card`
- antd `Input`, `Select`, `Checkbox` inside field palette buttons

---

## Implementation Approach

### Install antd

```bash
cd apps/frontend
npm install antd
```

### AntdProvider wrapper

Create `apps/frontend/src/components/AntdProvider.tsx` — a `'use client'` wrapper that injects `ConfigProvider` with the theme token overrides. The root `(app)/layout.tsx` wraps children with it.

### Coexistence with Tailwind

Tailwind stays for layout utilities (`grid`, `gap`, `flex`, spacing). antd provides interactive components (`Card`, `Table`, `Tag`, `Button`, `Statistic`, `Timeline`, `Drawer`, `Badge`). No conflict — they operate on different levels.

### File changes per page

Each page replaces its placeholder/ad-hoc JSX with antd components. No new routing or API changes needed — all data fetching stays the same.

---

## What Does NOT Change

- All NestJS backend API endpoints — no changes
- NextAuth session management — no changes  
- Sidebar component structure — only styling updated
- dnd-kit form builder core logic — only wrapping in antd Card
- Data fetching patterns (`getServerSession`, `useSession`, `fetch`)
