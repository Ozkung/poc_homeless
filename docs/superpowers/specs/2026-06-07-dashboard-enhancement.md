# Dashboard Enhancement — Design Spec
**Date:** 2026-06-07
**Status:** Approved
**Source:** ref/homemedconnect.html — Dashboard page

---

## Overview

Enhance the existing Dashboard page with:
1. **Alert banners** — surface critical patient situations at the top
2. **Bar chart** — Follow-up completions by week (last 4 weeks)
3. **Donut chart** — patient status distribution (วิกฤต / ต้องติดตาม / สเถียร)

All data is derived from existing API calls (`/patients`, `/events`). No new endpoints needed.

---

## 1. Alert Banners

Shown above the bento grid, only when relevant conditions exist.

| Condition | Alert type | Message |
|---|---|---|
| patients with `status = 'CRITICAL'` | `type="error"` | `X รายต้องดูแลด่วน` |
| tasks overdue (endDate < today, not DONE) | `type="warning"` | `Y งานค้าง ยังไม่ส่งมอบ` |

Implementation: derive from existing `patients` and add an `eventsThisMonth` fetch that also returns tasks. If no critical patients and no overdue tasks → render nothing.

antd `Alert` component: `showIcon`, `banner` prop, dismissible (`closable`).

---

## 2. Bar Chart — Follow-up รายสัปดาห์

Position: inside a new antd `Card` in the bento grid (replaces the current empty bottom row).

```
4 bars = last 4 calendar weeks (Mon–Sun)
X-axis: W1 / W2 / W3 / W4
Y-axis: number of tasks with status DONE
Color: blue (#1677ff) for normal, green for highest bar
```

Data source: derive from `events` API — filter tasks within each week range, count DONE.

**Implementation approach:** pure CSS/inline div bars (same as ref) — no chart library needed. Each bar is a `<div>` with height proportional to count, hover shows tooltip via `title` attribute.

```tsx
// Bar structure
<div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
  {weeks.map((w) => (
    <div key={w.label}
      style={{ flex: 1, height: `${(w.count / maxCount) * 100}%`,
               background: '#1677ff', borderRadius: '3px 3px 0 0' }}
      title={`${w.label}: ${w.count} งาน`}
    />
  ))}
</div>
```

---

## 3. Donut Chart — สถานะผู้ป่วย

Position: inside a new antd `Card` beside the bar chart (2-column grid row).

```
SVG donut (80×80px)
3 arcs: CRITICAL (red #ff4d4f) / PENDING (amber #faad14) / STABLE (green #52c41a)
Legend: 3 rows with colored dot + label + count
```

Implementation: inline SVG with `stroke-dasharray` / `stroke-dashoffset` (same technique as ref). Values calculated from `patients` array already fetched.

```tsx
// Arc calculation
const total = patients.length;
const circumference = 2 * Math.PI * 30; // r=30
const criticalArc = (critical / total) * circumference;
// etc.
```

---

## Bento Grid Change

Current 3×2 grid becomes 3×3:

```
Row 1:  [Hero card — 2 cols × 2 rows]   [Critical]
Row 2:                                   [Events]
Row 3:  [Bar chart]   [Donut chart]      [Stable]
```

---

## Files to Change

| File | Change |
|---|---|
| `app/(app)/dashboard/page.tsx` | Add alert banners, bar chart card, donut chart card, week calculation logic |

No backend changes needed — all data derived from existing API responses.

---

## What Does NOT Change

- Existing 4 stat cards
- Recent patients list
- API endpoints
