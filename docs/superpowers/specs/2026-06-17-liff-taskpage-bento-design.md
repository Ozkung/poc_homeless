# LIFF TaskPage Bento Redesign — Design Spec

**Date:** 2026-06-17

## Overview

Redesign `apps/liff/src/pages/TaskPage.tsx` from a flat card list into a **bento-style layout** where each event is a collapsible tile with a priority-colored header, and patients inside are arranged in an adaptive 2-column grid.

---

## Current Layout (before)

- Single scrolling list of event cards
- Each event: white card with title/date/priority badge, then patient rows below
- All events always expanded, no interaction on header

## New Layout (after)

- Each event = a **bento tile** with colored header (priority-based) and collapsible body
- Inside each tile: **adaptive 2-column patient grid**
  - Highest-priority patient(s) → `span 2` (full-width tile, larger)
  - Other patients → half-width tiles
  - Done/Not-found patients → dim tile, no action buttons
- No stats summary tiles at top
- SOS bar remains fixed at bottom

---

## Visual Design

### Event Header Colors (by event priority)

| Priority | Gradient |
|---|---|
| `CRITICAL` | `#ef4444` → `#dc2626` (red) |
| `URGENT` | `#f59e0b` → `#d97706` (amber) |
| `NORMAL` | `#3b82f6` → `#2563eb` (blue) |

Header content:
- Event title (bold, white)
- Meta row: 📅 date · priority badge · N ผู้ป่วย
- Chevron icon (▼ expanded / ▶ collapsed) — right-aligned

### Collapsible Behavior

- Events are **expanded by default**
- Tapping the header toggles collapsed state (stored in `useState<Set<string>>`)
- Collapsed events show only the header, patient grid is hidden
- Chevron rotates `-90deg` when collapsed

### Patient Grid (inside each event)

2-column CSS grid with `gap: 8px`, inside a white container with `padding: 10px`.

**Tile size rules:**
- If a patient's task priority = CRITICAL → `grid-column: span 2` (full width)
- All others → single column (half width)
- If `tasks.length === 1` → always full width regardless of priority

**Patient tile content:**
- Name (bold), HN (small gray)
- Location text (📍, 2 lines max) — if present
- Status row: colored dot + status label
- Conditions tags — if present
- Action buttons row — only if `canAct` (status !== DONE && !== NOT_FOUND)

**Tile visual state:**
- CRITICAL task → `border-color: #fca5a5`, faint red gradient background
- URGENT task → `border-color: #fcd34d`, faint amber gradient background
- DONE/NOT_FOUND → `opacity: 0.55`, no action buttons
- Default → `border-color: #e2e8f0`, white background

**Priority indicator dot** (top-right corner of tile):
- CRITICAL → red dot with glow (`box-shadow: 0 0 4px #ef4444`)
- URGENT → amber dot
- Others → no dot

### Action Buttons (unchanged from current)

Same buttons as current TaskPage, same routing:
- `📋 {formTemplate.title}` → `/form/:taskId/:formId?token=...` (purple filled)
- `Check-in` → `/checkin/:taskId` (outline purple) — only when PENDING
- `บันทึก` → `/note/:taskId` (outline gray)
- `แผนดูแล` → `/care-plan/:patientId` (outline blue) — if patient.id exists

### Top Bar

Same as current: brand label + title + subtitle + avatar → `/profile` link. No stats tiles added.

### SOS Bar

Unchanged — fixed bottom, red background, full width.

---

## Architecture

### File Changed

| File | Change |
|---|---|
| `apps/liff/src/pages/TaskPage.tsx` | Full redesign — same data fetching, new render logic |

No new files. No API changes. No routing changes. All existing `api` calls, `STATUS_LABEL`, `STATUS_DOT`, `PRIORITY_BADGE` constants remain — add new style helpers alongside them.

### New State

```tsx
const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

function toggleCollapse(eventId: string) {
  setCollapsed(prev => {
    const next = new Set(prev);
    next.has(eventId) ? next.delete(eventId) : next.add(eventId);
    return next;
  });
}
```

### Patient Tile Span Logic

```tsx
// A patient tile is full-width if:
// - Its task priority is CRITICAL, OR
// - It is the only patient in the event
const isFullWidth = (task: any, groupTasks: any[]) =>
  task.priority === 'CRITICAL' || groupTasks.length === 1;
```

Note: task priority comes from `task.event?.priority` in the current data shape. Verify field name when implementing.

---

## Styling

The LIFF app uses a mix of **Tailwind CSS classes** and **inline styles**. Follow existing pattern:
- Layout structure: Tailwind classes
- Colors and gradients specific to this feature: inline styles
- Keep `const inp`, `const btn` style helpers pattern for reusable pieces

### New style constants to add

```tsx
const PRIORITY_HEADER: Record<string, string> = {
  CRITICAL: 'linear-gradient(135deg, #ef4444, #dc2626)',
  URGENT:   'linear-gradient(135deg, #f59e0b, #d97706)',
  NORMAL:   'linear-gradient(135deg, #3b82f6, #2563eb)',
};

const PRIORITY_GLOW: Record<string, string> = {
  CRITICAL: '#ef4444',
  URGENT:   '#f59e0b',
};

const TILE_BORDER: Record<string, string> = {
  CRITICAL: '#fca5a5',
  URGENT:   '#fcd34d',
};

const TILE_BG: Record<string, string> = {
  CRITICAL: 'linear-gradient(145deg, #fff5f5, #fff)',
  URGENT:   'linear-gradient(145deg, #fffbeb, #fff)',
};
```

---

## Error / Edge Cases

| Case | Behavior |
|---|---|
| No tasks | Empty state unchanged ("ไม่มีงานในพื้นที่ขณะนี้") |
| Loading | Skeleton placeholders unchanged |
| SOS sent | Full-screen confirmation unchanged |
| Single patient in event | Tile always full-width |
| Event with all DONE patients | Event tile still shows, all patients dim |
| Event priority undefined | Fall back to `NORMAL` (blue) header |

---

## Out of Scope

- Backend changes
- New API endpoints
- Changes to other LIFF pages (CheckinPage, FormPage, etc.)
- Filter/sort functionality
- Animation/transition on collapse (keep it instant for now)
