# Dashboard Highcharts — Severity Analysis & Age Cluster

**Date:** 2026-06-08
**Status:** Approved

## Goal

Add two Highcharts visualisations to the CM Dashboard:
1. **Severity Distribution** — Donut + Column combo inside the existing hero card, replacing the "recent patients" list section
2. **Age Cluster** — Stacked Column chart in a new full-width card below the bento grid, showing patient counts per age band broken down by severity

## Architecture

The dashboard (`apps/frontend/src/app/(app)/dashboard/page.tsx`) is a **server component** that fetches data via `getServerSession` + `fetch`. Highcharts requires the DOM, so charts must run client-side.

Pattern: server component fetches data → passes plain props to a `'use client'` chart component. This keeps auth/fetch server-side and avoids hydration issues.

### New files

| File | Purpose |
|------|---------|
| `apps/frontend/src/components/charts/SeverityChart.tsx` | `'use client'` — Donut + Column (Highcharts) for severity distribution |
| `apps/frontend/src/components/charts/AgeClusterChart.tsx` | `'use client'` — Stacked Column (Highcharts) for age cluster |

### Modified files

| File | Change |
|------|--------|
| `apps/frontend/src/app/(app)/dashboard/page.tsx` | Remove "recent patients" section; add `<SeverityChart>` in hero card; add `<AgeClusterChart>` in new full-width card |

## Dependencies

Install in `apps/frontend`:
```bash
npm install highcharts highcharts-react-official
```

`highcharts-react-official` provides the `HighchartsReact` wrapper component compatible with Next.js App Router `'use client'`.

## Data

Both charts receive pre-computed props from the server component — no client-side fetch needed.

### SeverityChart props
```typescript
interface SeverityChartProps {
  critical: number;  // patients with status === 'CRITICAL'
  pending: number;   // patients with status === 'PENDING'
  stable: number;    // patients with status === 'STABLE'
}
```

### AgeClusterChart props
```typescript
interface AgeClusterChartProps {
  bands: {
    label: string;       // '<20' | '20–40' | '40–60' | '60+'
    critical: number;
    pending: number;
    stable: number;
  }[];
}
```

Age bands computed server-side from `patient.age`:
- `<20`: age < 20 or age null treated as unknown (separate band if >0, else skip)
- `20–40`: 20 ≤ age < 40
- `40–60`: 40 ≤ age < 60
- `60+`: age ≥ 60

Patients with `age == null` are counted in a "ไม่ระบุ" band only if their count > 0.

## Chart Specs

### SeverityChart — Donut + Column

Two charts rendered side-by-side inside one `div`:

**Left: Highcharts Pie (donut)**
- `chart.type: 'pie'`
- `plotOptions.pie.innerSize: '60%'` (donut)
- Series: `[{ name: 'วิกฤต', y: critical, color: '#ff4d4f' }, { name: 'รอดำเนินการ', y: pending, color: '#faad14' }, { name: 'ปกติ', y: stable, color: '#52c41a' }]`
- Center label: total count
- No legend (legend shown via HTML below chart)
- `chart.height: 160`, `chart.margin: [0,0,0,0]`

**Right: Highcharts Column**
- `chart.type: 'column'`
- Categories: `['วิกฤต', 'รอดำเนินการ', 'ปกติ']`
- Single series with per-point color: `['#ff4d4f', '#faad14', '#52c41a']`
- No legend, no gridlines on Y, minimal axes
- `chart.height: 160`

Both charts share: `credits.enabled: false`, `title: null`, `tooltip` shows count + percentage.

### AgeClusterChart — Stacked Column

- `chart.type: 'column'`
- `plotOptions.column.stacking: 'normal'`
- X categories: age band labels
- Three series (one per severity, stacked):
  - `{ name: 'วิกฤต', color: '#ff4d4f', data: [...] }`
  - `{ name: 'รอดำเนินการ', color: '#faad14', data: [...] }`
  - `{ name: 'ปกติ', color: '#52c41a', data: [...] }`
- Legend at bottom, `chart.height: 220`
- Tooltip: show each severity count + total for the band
- `credits.enabled: false`

## Dashboard Layout Changes

**Hero card** (2 cols × 2 rows) — remove the divider + "ผู้ป่วยล่าสุด" section entirely. Replace with:
```tsx
<div style={{ borderTop: '1px solid #f5f5f5', margin: '20px -24px 0', paddingTop: 16, paddingLeft: 24, paddingRight: 24 }}>
  <div style={{ fontSize: 9, color: '#888', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
    วิเคราะห์ตามความร้ายแรง
  </div>
  <SeverityChart critical={critical} pending={pending} stable={stable} />
</div>
```

**New card** — full 3-column span, below the bento grid:
```tsx
<Card style={{ gridColumn: 'span 3', borderTop: '3px solid #722ed1' }} styles={{ body: { padding: 24 } }}>
  <div style={{ fontSize: 9, color: '#888', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>
    Cluster ผู้ป่วยตามช่วงอายุ
  </div>
  <AgeClusterChart bands={ageBands} />
</Card>
```

## SSR Handling

Highcharts accesses `window` on import. In Next.js App Router with `'use client'`, this is handled by lazy-loading the HighchartsReact component:

```typescript
// Inside chart components:
'use client';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
```

`'use client'` boundary ensures these only render in the browser. No dynamic import needed when the component itself is already `'use client'`.

## Colours (consistent with existing theme)

| Severity | Hex |
|----------|-----|
| CRITICAL | `#ff4d4f` |
| PENDING | `#faad14` |
| STABLE | `#52c41a` |
| Age cluster accent | `#722ed1` |

## Out of Scope

- Location-based clustering (deferred — can add later as a third chart card)
- Historical trend charts (no time-series data in current schema)
- Interactive drill-down (clicking a chart segment navigates to filtered patient list)
