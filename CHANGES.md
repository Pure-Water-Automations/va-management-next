# Capacity/Utilization overhaul

## What changed

- `src/lib/services/capacity.ts` — rewritten as the single source of pure,
  unit-tested capacity logic: `computeExpectedHours` (proration),
  `computeUtilization`, `computeFlags`, `detectTransition` (with hysteresis
  bands), `capacityWindow`/`startOfUtcDay`/`activeDaysInWindow` (14 complete
  UTC days), `isHoursStale`, `resolveCapacityThresholds`, and the composed
  `computeCapacity` (no-target exclusion + tracking-gap precedence).
- `src/lib/services/hours-source.ts` — extended the existing payroll
  `HoursSource` seam with `capacityHoursByVa` (task + at-work hours per VA
  over a window) and `assignedHoursByVa` (demand-side, read-only for now),
  so capacity code never queries `DeskLogHours` directly.
- `worker/capacity-monitor.ts` — rewritten to use the window/proration/
  hysteresis/staleness helpers; skips flagging entirely (no events, no
  email) when hours data is >2 days stale; emits a `tracking_gap` flag
  (severity yellow) instead of `underutilized` when a VA is clocked in but
  not logging task hours.
- `src/lib/reads/hr.ts`, `src/lib/reads/hr-extra.ts`, `src/lib/reads/va.ts` —
  all now go through `computeCapacity`; no threshold logic duplicated in
  read paths. HR reads also expose `noTargetVas` / `noTarget` list.
- `src/app/(app)/hr/page.tsx`, `src/app/(app)/hr/capacity/page.tsx` — surface
  the tracking-gap flag with its own badge/copy and a "No target set"
  data-quality section.
- `prisma/schema.prisma` — added `Va.startDate` (nullable hire/start date;
  `roleStartedDate` was rejected for this because it resets on every tier
  promotion). Migration: `prisma/migrations/20260716000000_va_start_date/`.

## New settings (Admin → Setting records; all optional, defaults shown)

| Key | Default | Meaning |
|---|---|---|
| `capacity_overburdened_pct` | `120` | Utilization % above which a VA is overburdened |
| `capacity_overburdened_clear_pct` | `110` | Hysteresis: utilization must drop below this to clear a red flag |
| `capacity_underutilized_pct` | `50` | Utilization % below which a VA is underutilized (display) |
| `capacity_underutilized_enter_pct` | `45` | Hysteresis: utilization must drop below this to *enter* underutilized |
| `capacity_underutilized_clear_pct` | `55` | Hysteresis: utilization must rise above this to clear a yellow flag |
| `capacity_relative_hours_multiplier` | `1.5` | Absolute-cap rule: flag if logged hours > expected hours × this |
| `capacity_max_weekly_hours` | `45` | Absolute ceiling (per week) — flag if logged hours > this × 2 over the 14-day window |
| `capacity_tracking_gap_pct` | `50` | % of expected hours used to detect "clocked in but not logging tasks" |

## Notes / follow-ups

- Pre-existing, unrelated schema drift found during this work: `Deal.startDate`
  is declared in `prisma/schema.prisma` but has no migration yet. Left
  untouched (out of scope) — flagged for a separate fix.
- No PTO/leave model exists yet, so `computeExpectedHours` only prorates for
  a VA's `startDate`; leave-day subtraction is a clearly marked seam for later
  (see the `Va.startDate` comment and `computeExpectedHours` call sites).
- `demandVsSupply` (assigned vs. tracked vs. target hours) is now computed in
  `getCapacity()` (`src/lib/reads/hr-extra.ts`) per VA using the new
  `HoursSource.assignedHoursByVa`, per task 8 — read-only, not flagged on, and
  not yet wired into the `/hr/capacity` UI (no card designed for it yet).
