# Payroll Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/payroll` from a period-calculation/CSV tool into a payroll operations dashboard: auto semi-monthly periods (15th / EOM−2), stat tiles, a searchable VA table, a Submitted → Approved → Paid row flow with supervisor approval, anomaly flags, and hours-per-client attribution — per the approved [Payroll Dashboard Proposal](https://app.notion.com/p/398063b66bf181eda3bbf7fad3397eac).

**Architecture:** All hours reads go through a new `HoursSource` adapter (DeskLog today, the in-house tracker later). Pure service modules (`pay-schedule`, `payroll-anomalies`) carry the date math and flag logic with node:test coverage; Prisma adds row-status/approval fields plus `VaPaymentProfile` (method+currency only — recipient details are Phase 3) and `ClientProjectMap`. The `/payroll` page becomes a server-loaded dashboard with a client table component, following the house pattern (server page → `"use client"` component → op-dispatch API via `action()`).

**Tech Stack:** Next.js 15 App Router, React 19, Prisma/Postgres, node:test. No new dependencies.

**Scope:** Phases 1–2 of the proposal, in full. Phases 3 (payment execution) and 4 (billing & margin) are **separate plans**, blocked behind the Pre-Phase-3 gate on the proposal page (§ "Deferred phases" below).

**Deploy target:** the **shared dev box — dev-team.pwasecondbrain.uk** (`./deploy.sh dev`). NOT the discovery sales instance. Before deploying, check what branch is on the box (see `deploy-verify-shared-dev` note: don't clobber unmerged work; verify with a real page load + journal, not just `/api/health`).

**Branch:** `feature/payroll-dashboard` (off `main`).

**Working assumptions locked by review (Notion §14):** pay in-arrears (Run B pays through EOM−2, trailing 2 days roll forward) · bill rates per-tier-per-client (Phase 4) · trusted-VA = HR flag · USD rates, payout FX at execution (Phase 3) · supervisor approval rides `Va.supervisorVaId` + HR_MANAGER/admin, not a hardcoded role.

---

## Existing code you build on (read these first)

| File | What it is |
|---|---|
| `prisma/schema.prisma:269-300` | `PayrollPeriod` (PK `periodStart`, status open/closed/paid, reminder stamps) + `PayrollCalculation` (`@@unique([periodStart, vaId])`, hours/rate/gross snapshot) |
| `prisma/schema.prisma:204-244` | `DeskLogHours` (per-VA per-day, `project`/`task` strings, `taskSpentHrs`, `needsReview`) + `DeskLogEfficiency` |
| `prisma/schema.prisma:148-181` | `Va` — has `supervisorVaId` (Supervision relation), `targetHoursWeekly`, `compensationRole` |
| `src/lib/services/payroll-calc.ts` | Pure gross-pay math (`computeGrossPay`, `computePeriodCalculations`) — do not break; `tests/payroll.test.ts` covers it |
| `src/lib/actions/payroll.ts` | `createPeriod` / `recalculateOpenPeriod` / `lockOpenPeriod` / `markPeriodPaid` / `reopenPeriod` — DeskLog groupBy lives here today |
| `worker/payroll-close.ts` | Daily worker: T-3/T-1 reminders, close-date recalc + close + bookkeeper CSV |
| `src/lib/reads/payroll.ts` | `getPayrollDashboard()` server read |
| `src/app/(app)/payroll/page.tsx` + `archive/page.tsx` | Current UI |
| `src/app/api/payroll/*/route.ts` | Existing per-action routes (recalculate, lock, mark-paid, reopen, create-period) |
| `src/lib/api.ts` | `action()` wrapper — guard pattern used by all op-dispatch APIs |
| `src/components/sales/ui.tsx` | Shared atoms: `Chip`, `StatCard`, `StatGrid`, `ProgressBar`, `useToast`, `postJson` — reuse, don't re-implement |
| `src/lib/auth/roles.ts` | `Role` enum; BOOKKEEPER → PAYROLL view |

Run all tests with `npm test` (node:test over `tests/*.test.ts`). Migration recipe (never `prisma migrate dev` — it hangs agents):

```bash
createdb va_console_shadow 2>/dev/null; TS=$(date +%Y%m%d%H%M%S)
mkdir -p "prisma/migrations/${TS}_<name>"
npx prisma migrate diff --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "postgresql://justinokamoto@localhost:5432/va_console_shadow" \
  --script > "prisma/migrations/${TS}_<name>/migration.sql"
npx prisma migrate deploy && npx prisma generate
```

---

# Phase 1 — Core dashboard & schedule

### Task 1: Pay-schedule service (semi-monthly periods, pure)

**Files:**
- Create: `src/lib/services/pay-schedule.ts`
- Test: `tests/pay-schedule.test.ts`

All dates are **UTC date-only** (`new Date(Date.UTC(y, m, d))`), matching `dateOnly()` in `src/lib/actions/payroll.ts:276`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/pay-schedule.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { periodContaining, nextPeriodAfter, type PayPeriod } from "../src/lib/services/pay-schedule";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));
const key = (x: Date) => x.toISOString().slice(0, 10);
const asKeys = (p: PayPeriod) => ({ start: key(p.periodStart), end: key(p.periodEnd), run: key(p.runDate) });

test("Run A: 1st–15th, pay run on the 15th", () => {
  assert.deepEqual(asKeys(periodContaining(d(2026, 7, 1))), { start: "2026-07-01", end: "2026-07-15", run: "2026-07-15" });
  assert.deepEqual(asKeys(periodContaining(d(2026, 7, 15))), { start: "2026-07-01", end: "2026-07-15", run: "2026-07-15" });
});

test("Run B: 16th–EOM, pay run 2 days before month end", () => {
  // July has 31 days → run Jul 29
  assert.deepEqual(asKeys(periodContaining(d(2026, 7, 16))), { start: "2026-07-16", end: "2026-07-31", run: "2026-07-29" });
  assert.deepEqual(asKeys(periodContaining(d(2026, 7, 31))), { start: "2026-07-16", end: "2026-07-31", run: "2026-07-29" });
});

test("Run B: February (non-leap and leap)", () => {
  assert.deepEqual(asKeys(periodContaining(d(2026, 2, 20))), { start: "2026-02-16", end: "2026-02-28", run: "2026-02-26" });
  assert.deepEqual(asKeys(periodContaining(d(2028, 2, 20))), { start: "2028-02-16", end: "2028-02-29", run: "2028-02-27" });
});

test("nextPeriodAfter chains A→B→A across the month boundary", () => {
  const a = periodContaining(d(2026, 7, 3));
  const b = nextPeriodAfter(a);
  assert.deepEqual(asKeys(b), { start: "2026-07-16", end: "2026-07-31", run: "2026-07-29" });
  const c = nextPeriodAfter(b);
  assert.deepEqual(asKeys(c), { start: "2026-08-01", end: "2026-08-15", run: "2026-08-15" });
});

test("periods tile the calendar with no gaps or overlaps for a full year", () => {
  let p = periodContaining(d(2026, 1, 1));
  for (let i = 0; i < 24; i++) {
    const n = nextPeriodAfter(p);
    // next period starts exactly one day after the previous ends
    assert.equal(n.periodStart.getTime(), p.periodEnd.getTime() + 24 * 60 * 60 * 1000, `gap after ${key(p.periodEnd)}`);
    // run date is always within the period (in-arrears for Run B: hours after run roll forward)
    assert.ok(n.runDate >= n.periodStart && n.runDate <= n.periodEnd);
    p = n;
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -A2 "pay-schedule"`
Expected: FAIL — `Cannot find module '../src/lib/services/pay-schedule'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/services/pay-schedule.ts
// Semi-monthly pay schedule (proposal §4):
//   Run A: covers the 1st → 15th, pay run ON the 15th.
//   Run B: covers the 16th → end of month, pay run 2 days BEFORE the last day.
// Paying in-arrears: hours logged after Run B's run date simply fall into the
// next period at calculation time — no estimates, no true-ups (review §14).
// All values are UTC date-only Dates, matching actions/payroll.ts dateOnly().

export type PayPeriod = {
  periodStart: Date;
  periodEnd: Date;
  runDate: Date; // == PayrollPeriod.closeDate
};

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** The pay period containing the given UTC date. */
export function periodContaining(date: Date): PayPeriod {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  if (date.getUTCDate() <= 15) {
    return { periodStart: utc(y, m, 1), periodEnd: utc(y, m, 15), runDate: utc(y, m, 15) };
  }
  const eom = lastDayOfMonth(y, m);
  return { periodStart: utc(y, m, 16), periodEnd: utc(y, m, eom), runDate: utc(y, m, eom - 2) };
}

/** The period immediately after the given one (A→B within a month, B→next month's A). */
export function nextPeriodAfter(p: PayPeriod): PayPeriod {
  const dayAfterEnd = new Date(p.periodEnd.getTime() + 24 * 60 * 60 * 1000);
  return periodContaining(dayAfterEnd);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | grep -B1 -A3 "pay-schedule"`
Expected: all 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/pay-schedule.ts tests/pay-schedule.test.ts
git commit -m "feat(payroll): semi-monthly pay-schedule service (15th / EOM-2)"
```

---

### Task 2: Hours-source abstraction (DeskLog adapter)

**Files:**
- Create: `src/lib/services/hours-source.ts`
- Modify: `src/lib/actions/payroll.ts:76-103` (use the adapter), `worker/payroll-close.ts:20-31` (same)
- Test: `tests/hours-source.test.ts`

Why: DeskLog is being replaced by the in-house tracker (timetracking test app). Payroll must never import `db.deskLogHours` directly again — everything reads through this interface so the swap is one new adapter.

- [ ] **Step 1: Write the failing test**

```ts
// tests/hours-source.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { totalsFromBreakdown, type HoursBreakdownRow } from "../src/lib/services/hours-source";

test("totalsFromBreakdown sums per-VA hours from breakdown rows", () => {
  const rows: HoursBreakdownRow[] = [
    { vaId: "v1", date: new Date("2026-07-02"), project: "Client A — Admin", task: "Email", hours: 3, needsReview: false },
    { vaId: "v1", date: new Date("2026-07-03"), project: "Internal", task: "Training", hours: 2, needsReview: true },
    { vaId: "v2", date: new Date("2026-07-02"), project: null, task: null, hours: 4.5, needsReview: false },
  ];
  assert.deepEqual(totalsFromBreakdown(rows), { v1: 5, v2: 4.5 });
});

test("totalsFromBreakdown handles empty input", () => {
  assert.deepEqual(totalsFromBreakdown([]), {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A2 "hours-source"`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/services/hours-source.ts
// The ONE seam between payroll and whatever time tracker is in use.
// DeskLog today; the in-house tracker later — swap by adding an adapter and
// changing activeHoursSource(). Payroll code must not query DeskLog tables
// directly (proposal review flag #1).
import { db } from "@/lib/db";

export type HoursBreakdownRow = {
  vaId: string;
  date: Date;
  project: string | null; // free-text tracker project — ClientProjectMap resolves to a client org
  task: string | null;
  hours: number;
  needsReview: boolean;
};

export interface HoursSource {
  /** Total payable hours per VA over [periodStart, periodEnd] (inclusive, date-only). */
  hoursByVa(periodStart: Date, periodEnd: Date, vaIds?: string[]): Promise<Record<string, number>>;
  /** Cumulative hours per VA strictly before `before` (trainee gateway math). */
  priorHoursByVa(before: Date, vaIds: string[]): Promise<Record<string, number>>;
  /** Per-day project/task rows for the drill-down + anomaly checks. */
  breakdown(periodStart: Date, periodEnd: Date, vaIds?: string[]): Promise<HoursBreakdownRow[]>;
}

/** Pure helper (unit-tested): per-VA totals from breakdown rows. */
export function totalsFromBreakdown(rows: HoursBreakdownRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.vaId] = (out[r.vaId] ?? 0) + r.hours;
  return out;
}

class DeskLogHoursSource implements HoursSource {
  async hoursByVa(periodStart: Date, periodEnd: Date, vaIds?: string[]) {
    const grouped = await db.deskLogHours.groupBy({
      by: ["vaId"],
      where: {
        ...(vaIds ? { vaId: { in: vaIds } } : {}),
        date: { gte: periodStart, lte: periodEnd },
      },
      _sum: { taskSpentHrs: true },
    });
    return Object.fromEntries(grouped.map((g) => [g.vaId, g._sum.taskSpentHrs ?? 0]));
  }

  async priorHoursByVa(before: Date, vaIds: string[]) {
    const grouped = await db.deskLogHours.groupBy({
      by: ["vaId"],
      where: { vaId: { in: vaIds }, date: { lt: before } },
      _sum: { taskSpentHrs: true },
    });
    return Object.fromEntries(grouped.map((g) => [g.vaId, g._sum.taskSpentHrs ?? 0]));
  }

  async breakdown(periodStart: Date, periodEnd: Date, vaIds?: string[]) {
    const rows = await db.deskLogHours.findMany({
      where: {
        ...(vaIds ? { vaId: { in: vaIds } } : {}),
        date: { gte: periodStart, lte: periodEnd },
      },
      select: { vaId: true, date: true, project: true, task: true, taskSpentHrs: true, needsReview: true },
      orderBy: [{ vaId: "asc" }, { date: "asc" }],
    });
    return rows.map((r) => ({
      vaId: r.vaId,
      date: r.date,
      project: r.project,
      task: r.task,
      hours: r.taskSpentHrs,
      needsReview: r.needsReview,
    }));
  }
}

/** The tracker currently feeding payroll. */
export function activeHoursSource(): HoursSource {
  return new DeskLogHoursSource();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test 2>&1 | grep -A3 "hours-source"` → PASS (2 tests).

- [ ] **Step 5: Refactor `recalculateOpenPeriod` to use the adapter**

In `src/lib/actions/payroll.ts`, replace the two `db.deskLogHours.groupBy` calls (lines 76–103) with:

```ts
import { activeHoursSource } from "@/lib/services/hours-source";
// ...inside recalculateOpenPeriod(), replacing the Promise.all groupBy block:
  const source = activeHoursSource();
  const [hoursByVaId, priorHoursByVaId] = await Promise.all([
    source.hoursByVa(period.periodStart, period.periodEnd, vaIds),
    source.priorHoursByVa(period.periodStart, vaIds),
  ]);
```

(Delete the now-unused `periodHours`/`priorHours` `Object.fromEntries` lines.)

- [ ] **Step 6: Refactor `worker/payroll-close.ts` the same way**

In `recalc()`, swap the third element of the `Promise.all` (the `db.deskLogHours.groupBy` at lines 24–31) and delete the `hoursByVaId` assembly loop after it:

```ts
import { activeHoursSource } from "@/lib/services/hours-source";
// in recalc():
  const [vas, roles, hoursByVaId] = await Promise.all([
    db.va.findMany({ where: { status: { in: ["active", "training"] } } }),
    db.compensationRole.findMany(),
    activeHoursSource().hoursByVa(periodStart, periodEnd),
  ]);
  // delete: const hoursByVaId: Record<string, number> = {}; for (const h of hours) ...
```

- [ ] **Step 7: Typecheck + full test suite**

Run: `npx tsc --noEmit && npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: tsc clean; same pass/fail counts as `main` baseline (227/15 — the 15 are pre-existing env-dependent failures).

- [ ] **Step 8: Commit**

```bash
git add src/lib/services/hours-source.ts tests/hours-source.test.ts src/lib/actions/payroll.ts worker/payroll-close.ts
git commit -m "feat(payroll): hours-source adapter — payroll no longer reads DeskLog tables directly"
```

---

### Task 3: Schema migration — row status, approval, flags, payment profile (method only), project map

**Files:**
- Modify: `prisma/schema.prisma` (PayrollCalculation, Va, + 2 new models)
- Create: `prisma/migrations/<ts>_payroll_dashboard_phase1/migration.sql`

- [ ] **Step 1: Add to `PayrollCalculation`** (after `grossPay`):

```prisma
  // ── Approval flow (proposal §6.2): Submitted → Approved → Paid ─────────
  rowStatus       PayrollRowStatus @default(submitted)
  approvedByEmail String?
  approvedAt      DateTime?
  paidAt          DateTime?
  excludedReason  String? // set when rowStatus = excluded
  // ── Anomaly detection (§6.4) ───────────────────────────────────────────
  flagged         Boolean          @default(false)
  flagReasons     Json             @default("[]") // string[]
```

And the enum (near `PeriodStatus`):

```prisma
enum PayrollRowStatus {
  submitted
  approved
  excluded
  paid
}
```

- [ ] **Step 2: Add to `Va`** (after `notionDisplayTier`):

```prisma
  // Payroll: rows for this VA may be bulk-approved without individual review
  // (HR judgment flag — review §14). Anomaly-flagged rows always need review.
  trustedForBulkApprove Boolean @default(false)
```

- [ ] **Step 3: Add the two new models** (end of schema, new section):

```prisma
// ═══════════════════════════════════════════════════════════════════════
// Payroll dashboard (proposal: Payroll Dashboard Proposal, 2026-07-09)
// ═══════════════════════════════════════════════════════════════════════

/// Per-VA payout profile. Phase 1–2 stores only method + currency (drives the
/// dashboard badges). Recipient identifiers (encrypted) arrive in Phase 3 —
/// see the Pre-Phase-3 gate on the proposal page before adding them.
model VaPaymentProfile {
  id             String   @id @default(cuid())
  vaId           String   @unique
  method         String   @default("WISE") // WISE | REMITLY | PAYONEER | GREY
  payoutCurrency String   @default("USD")
  notes          String   @default("")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

/// Tracker project string → client organization (null = internal PWA work).
/// The keystone of hours-per-client attribution (§6.1); unmapped projects
/// surface in the needs-mapping queue on /payroll/mapping.
model ClientProjectMap {
  id             String   @id @default(cuid())
  project        String   @unique // exact tracker project string
  clientOrgId    String? // null = internal
  createdByEmail String   @default("")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

- [ ] **Step 4: Generate + apply the migration**

```bash
TS=$(date +%Y%m%d%H%M%S); mkdir -p "prisma/migrations/${TS}_payroll_dashboard_phase1"
npx prisma migrate diff --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "postgresql://justinokamoto@localhost:5432/va_console_shadow" \
  --script > "prisma/migrations/${TS}_payroll_dashboard_phase1/migration.sql"
npx prisma migrate deploy && npx prisma generate && npx tsc --noEmit
```

Expected: migration SQL contains `ALTER TABLE "PayrollCalculation"`, `ALTER TABLE "Va"`, `CREATE TABLE "VaPaymentProfile"`, `CREATE TABLE "ClientProjectMap"`, `CREATE TYPE "PayrollRowStatus"`; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add prisma/
git commit -m "feat(payroll): schema — row approval flow, anomaly flags, payment profile, client project map"
```

---

### Task 4: Auto-create the next period on the semi-monthly schedule

**Files:**
- Modify: `worker/payroll-close.ts` (after the `daysToClose <= 0` close branch)
- Test: covered by the pure pay-schedule tests (Task 1); the worker change is glue.

- [ ] **Step 1: Extend the close branch**

In `worker/payroll-close.ts`, inside the `else if (daysToClose <= 0)` branch, after the `logActivity` call, add:

```ts
        // Auto-create the next semi-monthly period (proposal §4) so payroll
        // never stalls waiting for a manual create-period.
        const next = nextPeriodAfter({
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          runDate: period.closeDate,
        });
        await db.payrollPeriod.upsert({
          where: { periodStart: next.periodStart },
          update: {},
          create: {
            periodStart: next.periodStart,
            periodEnd: next.periodEnd,
            closeDate: next.runDate,
            status: "open",
          },
        });
        action = "closed_and_created_next";
```

With the import at the top:

```ts
import { nextPeriodAfter } from "@/lib/services/pay-schedule";
```

- [ ] **Step 2: Make close-recalc reset row status to submitted**

Still in `worker/payroll-close.ts` `recalc()`, the `upsert` update/create blocks gain one field each (calculation refresh = re-submission; approval must look at final numbers):

```ts
        rowStatus: "submitted",
        approvedByEmail: null,
        approvedAt: null,
```

Apply the same three fields in `src/lib/actions/payroll.ts` `recalculateOpenPeriod`'s upsert (both `update` and `create`) — **except**: preserve `excluded` rows. Wrap the transaction rows:

```ts
  // Recalc re-submits every non-excluded row: approvals must attach to the
  // final numbers, not stale ones.
  const excluded = new Set(
    (
      await db.payrollCalculation.findMany({
        where: { periodStart: period.periodStart, rowStatus: "excluded" },
        select: { vaId: true },
      })
    ).map((r) => r.vaId),
  );
```

and in each upsert's `update`/`create` objects add:

```ts
          rowStatus: excluded.has(row.vaId) ? "excluded" : "submitted",
          approvedByEmail: null,
          approvedAt: null,
```

- [ ] **Step 3: Typecheck + tests, then verify the worker compiles standalone**

Run: `npx tsc --noEmit && npm test 2>&1 | grep -E "^# (pass|fail)"` → clean/baseline.

- [ ] **Step 4: Commit**

```bash
git add worker/payroll-close.ts src/lib/actions/payroll.ts
git commit -m "feat(payroll): auto-create next semi-monthly period; recalc resets rows to submitted"
```

---

### Task 5: Dashboard reads — tiles, table rows, drill-down

**Files:**
- Modify: `src/lib/reads/payroll.ts` (extend `getPayrollDashboard`, add `getVaPeriodBreakdown`)

- [ ] **Step 1: Extend the dashboard read**

Replace the body of `src/lib/reads/payroll.ts` with:

```ts
import { db } from "@/lib/db";
import { activeHoursSource, type HoursBreakdownRow } from "@/lib/services/hours-source";
import { periodContaining, nextPeriodAfter } from "@/lib/services/pay-schedule";

export type PayrollDashboard = Awaited<ReturnType<typeof getPayrollDashboard>>;

export async function getPayrollDashboard() {
  const openPeriod =
    (await db.payrollPeriod.findFirst({ where: { status: "open" }, orderBy: { periodStart: "desc" } })) ??
    (await db.payrollPeriod.findFirst({ orderBy: { periodStart: "desc" } }));

  const [calcRows, vas, profiles, rateChanges, pastPeriods] = await Promise.all([
    openPeriod
      ? db.payrollCalculation.findMany({ where: { periodStart: openPeriod.periodStart }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    db.va.findMany({
      where: { status: { in: ["active", "training"] } },
      select: { vaId: true, supervisorVaId: true, trustedForBulkApprove: true, email: true },
    }),
    db.vaPaymentProfile.findMany(),
    db.tierReview.findMany({ where: { status: "approved" }, orderBy: { hrDecisionDate: "desc" }, take: 8 }),
    db.payrollPeriod.findMany({ where: { status: { in: ["closed", "paid"] } }, orderBy: { periodStart: "desc" }, take: 8 }),
  ]);

  const vaById = new Map(vas.map((v) => [v.vaId, v]));
  const profileByVa = new Map(profiles.map((p) => [p.vaId, p]));

  const rows = calcRows.map((r) => ({
    ...r,
    payMethod: profileByVa.get(r.vaId)?.method ?? null,
    payCurrency: profileByVa.get(r.vaId)?.payoutCurrency ?? "USD",
    trusted: vaById.get(r.vaId)?.trustedForBulkApprove ?? false,
    supervisorVaId: vaById.get(r.vaId)?.supervisorVaId ?? null,
  }));

  // Stat tiles (proposal §3)
  const totalGross = rows.reduce((s, r) => s + (r.grossPay ?? 0), 0);
  const totalHours = rows.reduce((s, r) => s + (r.hoursInPeriod ?? 0), 0);
  const beingPaid = rows.filter((r) => r.rowStatus !== "excluded" && (r.hoursInPeriod > 0 || r.compensationType === "salary")).length;
  const statusCounts = {
    submitted: rows.filter((r) => r.rowStatus === "submitted").length,
    approved: rows.filter((r) => r.rowStatus === "approved").length,
    paid: rows.filter((r) => r.rowStatus === "paid").length,
    excluded: rows.filter((r) => r.rowStatus === "excluded").length,
  };
  // Next run date: the open period's closeDate; if none, compute from today.
  const nextRun = openPeriod?.status === "open" ? openPeriod.closeDate : nextPeriodAfter(periodContaining(new Date())).runDate;

  return { openPeriod, rows, activeVaCount: vas.length, rateChanges, pastPeriods, totalGross, totalHours, beingPaid, statusCounts, nextRun };
}

export type VaPeriodBreakdown = {
  byProject: { project: string; clientOrgName: string | null; mapped: boolean; hours: number; tasks: { task: string; hours: number }[] }[];
  needsReviewDays: number;
  efficiencyPct: number | null;
};

/** Per-VA drill-down (proposal §5 row expand + §6.1): hours per project/task, mapped to clients. */
export async function getVaPeriodBreakdown(vaId: string, periodStart: Date, periodEnd: Date): Promise<VaPeriodBreakdown> {
  const [rows, maps, eff] = await Promise.all([
    activeHoursSource().breakdown(periodStart, periodEnd, [vaId]),
    db.clientProjectMap.findMany(),
    db.deskLogEfficiency.aggregate({
      where: { vaId, date: { gte: periodStart, lte: periodEnd } },
      _avg: { efficiencyPct: true },
    }),
  ]);
  const orgIds = maps.map((m) => m.clientOrgId).filter((x): x is string => !!x);
  const orgs = orgIds.length
    ? await db.clientOrganization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
    : [];
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const mapByProject = new Map(maps.map((m) => [m.project, m]));

  const byProject = new Map<string, { hours: number; tasks: Map<string, number> }>();
  let needsReviewDays = 0;
  for (const r of rows) {
    const p = r.project ?? "(no project)";
    const entry = byProject.get(p) ?? { hours: 0, tasks: new Map() };
    entry.hours += r.hours;
    const t = r.task ?? "(no task)";
    entry.tasks.set(t, (entry.tasks.get(t) ?? 0) + r.hours);
    byProject.set(p, entry);
    if (r.needsReview) needsReviewDays++;
  }

  return {
    byProject: [...byProject.entries()]
      .map(([project, e]) => {
        const m = mapByProject.get(project);
        return {
          project,
          mapped: !!m,
          clientOrgName: m?.clientOrgId ? (orgName.get(m.clientOrgId) ?? null) : m ? "Internal" : null,
          hours: Math.round(e.hours * 100) / 100,
          tasks: [...e.tasks.entries()].map(([task, hours]) => ({ task, hours: Math.round(hours * 100) / 100 })).sort((a, b) => b.hours - a.hours),
        };
      })
      .sort((a, b) => b.hours - a.hours),
    needsReviewDays,
    efficiencyPct: eff._avg.efficiencyPct,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` — expect complaints only if the current `/payroll/page.tsx` destructures removed fields (`calcRows`). Update `src/app/(app)/payroll/page.tsx` references from `calcRows` → `rows` (the page is rebuilt in Task 6 anyway, but keep it compiling now).

- [ ] **Step 3: Commit**

```bash
git add src/lib/reads/payroll.ts src/app/\(app\)/payroll/page.tsx
git commit -m "feat(payroll): dashboard reads — tiles, enriched rows, per-VA client/task breakdown"
```

---

### Task 6: Dashboard UI — stat tiles + VA table with search/filter/expand

**Files:**
- Modify: `src/app/(app)/payroll/page.tsx` (server page: keep guard + period admin actions, render new client component)
- Create: `src/components/payroll/PayrollDashboardClient.tsx`
- Create: `src/app/api/payroll/breakdown/route.ts` (GET drill-down, lazy-loaded on row expand)

- [ ] **Step 1: Breakdown API**

```ts
// src/app/api/payroll/breakdown/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/access";
import { getVaPeriodBreakdown } from "@/lib/reads/payroll";

// Per-VA drill-down for the payroll table row expand. Payroll staff + the
// VA's own login may read it (proposal §11 "see own hours/pay breakdown").
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const vaId = req.nextUrl.searchParams.get("vaId") ?? "";
  const start = new Date(req.nextUrl.searchParams.get("start") ?? "");
  const end = new Date(req.nextUrl.searchParams.get("end") ?? "");
  if (!vaId || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ ok: false, error: "vaId, start, end required" }, { status: 400 });
  }
  const staff = user.isAdmin || user.role === "BOOKKEEPER" || user.role === "HR_MANAGER" || user.role === "PEOPLE_OPS";
  if (!staff && user.vaId !== vaId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, result: await getVaPeriodBreakdown(vaId, start, end) });
}
```

- [ ] **Step 2: Rebuild the page (server side)**

`src/app/(app)/payroll/page.tsx` becomes: existing guard/actions preserved, then:

```tsx
import { getPayrollDashboard } from "@/lib/reads/payroll";
import { PayrollDashboardClient } from "@/components/payroll/PayrollDashboardClient";

export const dynamic = "force-dynamic";

export default async function PayrollPage() {
  const d = await getPayrollDashboard();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Payroll</div>
          <h1>Payroll dashboard</h1>
          <p className="small">
            Semi-monthly runs (the 15th and two days before month end). Hours flow in from the tracker,
            supervisors approve, the bookkeeper pays. Rows must be Approved before the period can lock.
          </p>
        </div>
      </div>
      <PayrollDashboardClient
        period={d.openPeriod ? { start: d.openPeriod.periodStart.toISOString(), end: d.openPeriod.periodEnd.toISOString(), closeDate: d.openPeriod.closeDate.toISOString(), status: d.openPeriod.status } : null}
        rows={JSON.parse(JSON.stringify(d.rows))}
        tiles={{ nextRun: d.nextRun.toISOString(), totalGross: d.totalGross, beingPaid: d.beingPaid, activeVaCount: d.activeVaCount, statusCounts: d.statusCounts }}
        pastPeriods={JSON.parse(JSON.stringify(d.pastPeriods))}
        rateChanges={JSON.parse(JSON.stringify(d.rateChanges))}
      />
    </>
  );
}
```

(Whatever the current page's role guard is — keep it verbatim. It gates on the PAYROLL view roles.)

- [ ] **Step 3: The client component**

`src/components/payroll/PayrollDashboardClient.tsx` — one file, following `src/components/sales/ClientAccountsClient.tsx` as the style reference. Requirements (all from proposal §3+§5):

- Import shared atoms: `import { Chip, StatCard, StatGrid, ProgressBar, useToast, postJson } from "@/components/sales/ui";`
- **Tiles row** (`<StatGrid>`): ① hero `StatCard` "Next payroll run" — `Jul 29` + sub "in N days" (compute from `tiles.nextRun`); ② "Total payable" — `$X,XXX.XX` + sub "this period"; ③ "VAs being paid" — `N` + sub `of ${activeVaCount} active`; ④ "Approval progress" — `approved/total` + a `ProgressBar pct={approved/nonExcludedTotal}` + sub `"S submitted · A approved · P paid"`.
- **Toolbar**: search input (name substring, case-insensitive), status filter select (All / Submitted / Approved / Excluded / Paid), tier filter select (distinct `compensationRole` values), method filter select (All / WISE / REMITLY / PAYONEER / GREY / —), "Flagged only" checkbox toggle.
- **Table** (grid columns `minmax(200px,1.4fr) 110px 120px 90px 120px 110px 110px 120px`): VA (name + avatar via `GradientAvatar`), Tier (`Chip` gray), Rate (`$X/hr` or `$X /period`), Hours, Gross (`$X.XX` bold), Currency, Method (`Chip` sky; "—" when null), Status chip — colors: submitted `#fff3d4/#966200`, approved `#d4f5e2/#1a7a4a`, excluded `#e8e8ed/#48484a`, paid `#c4eef9/#0d5e7e`. Flag icon (⚠, amber, `title={flagReasons.join("; ")}`) when `flagged`.
- **Row click → expand** (accordion below the row): fetches `/api/payroll/breakdown?vaId=&start=&end=` once (cache in component state), renders: per-project rows (project · client chip (`clientOrgName` / amber "unmapped" chip) · hours) each expandable to task lines; `needsReviewDays` count + average `efficiencyPct` line.
- Status-change buttons come in Task 8 (Phase 2) — render the chips read-only for now.
- Below the table: keep the existing period admin actions block and past-periods/rate-changes lists from the old page (move markup into this component or keep server-rendered below the component — either is fine; keep whichever needs fewer changes).

- [ ] **Step 4: Typecheck + run the app**

```bash
npx tsc --noEmit
(nohup npm run dev > /tmp/va-dev.log 2>&1 &) ; sleep 10
curl -s -o /dev/null -w "/payroll → %{http_code}\n" http://localhost:3032/payroll
curl -s http://localhost:3032/payroll | grep -o "Next payroll run"
kill $(lsof -ti:3032)
```

Expected: 200 + tile text present.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/payroll/page.tsx src/components/payroll/ src/app/api/payroll/breakdown/
git commit -m "feat(payroll): dashboard UI — stat tiles, filterable VA table, per-client drill-down"
```

---

# Phase 2 — Approval flow

### Task 7: Anomaly detection service (pure)

**Files:**
- Create: `src/lib/services/payroll-anomalies.ts`
- Test: `tests/payroll-anomalies.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/payroll-anomalies.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { detectAnomalies, type AnomalyInput } from "../src/lib/services/payroll-anomalies";

const base: AnomalyInput = {
  hoursInPeriod: 40,
  trailingPeriodHours: [38, 42, 40],
  targetHoursWeekly: 20,
  weeksInPeriod: 2.2,
  needsReviewDays: 0,
  newProjects: [],
  wasActiveLastPeriod: true,
  spikeMultiplier: 1.5,
};

test("normal hours produce no flags", () => {
  assert.deepEqual(detectAnomalies(base), []);
});

test("spike above 1.5x trailing average is flagged", () => {
  const r = detectAnomalies({ ...base, hoursInPeriod: 90 });
  assert.ok(r.some((x) => x.includes("1.5×")), JSON.stringify(r));
});

test("hours above target weekly x weeks is flagged", () => {
  const r = detectAnomalies({ ...base, hoursInPeriod: 50, trailingPeriodHours: [48, 50, 49] });
  assert.ok(r.some((x) => x.includes("target")), JSON.stringify(r));
});

test("zero hours for a previously active VA is flagged", () => {
  const r = detectAnomalies({ ...base, hoursInPeriod: 0 });
  assert.ok(r.some((x) => x.toLowerCase().includes("zero hours")), JSON.stringify(r));
});

test("needs-review tracker days and new projects are flagged", () => {
  const r = detectAnomalies({ ...base, needsReviewDays: 3, newProjects: ["Mystery Client"] });
  assert.equal(r.length, 2);
});

test("no trailing history means no spike flag (new VA grace)", () => {
  assert.deepEqual(detectAnomalies({ ...base, trailingPeriodHours: [], hoursInPeriod: 60, targetHoursWeekly: 40 }), []);
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test 2>&1 | grep -A2 anomal` → module not found.

- [ ] **Step 3: Implementation**

```ts
// src/lib/services/payroll-anomalies.ts
// Flag-for-review anomaly detection (proposal §6.4). Pure — callers assemble
// the inputs from the hours source + prior PayrollCalculation rows. Flagged
// rows are excluded from bulk-approve and show reasons inline.

export type AnomalyInput = {
  hoursInPeriod: number;
  /** Hours from up to the 3 most recent CLOSED periods (may be empty for new VAs). */
  trailingPeriodHours: number[];
  targetHoursWeekly: number | null;
  weeksInPeriod: number;
  needsReviewDays: number;
  newProjects: string[]; // projects logged this period never seen for this VA before
  wasActiveLastPeriod: boolean;
  spikeMultiplier?: number; // Setting `payroll_spike_multiplier`, default 1.5
};

export function detectAnomalies(i: AnomalyInput): string[] {
  const reasons: string[] = [];
  const mult = i.spikeMultiplier ?? 1.5;

  if (i.trailingPeriodHours.length > 0) {
    const avg = i.trailingPeriodHours.reduce((s, h) => s + h, 0) / i.trailingPeriodHours.length;
    if (avg > 0 && i.hoursInPeriod > avg * mult) {
      reasons.push(`Hours ${i.hoursInPeriod.toFixed(1)} exceed ${mult}× the trailing average (${avg.toFixed(1)})`);
    }
  }
  if (i.targetHoursWeekly != null && i.targetHoursWeekly > 0 && i.hoursInPeriod > i.targetHoursWeekly * i.weeksInPeriod) {
    reasons.push(`Hours exceed target (${i.targetHoursWeekly}/wk × ${i.weeksInPeriod.toFixed(1)} wks)`);
  }
  if (i.hoursInPeriod === 0 && i.wasActiveLastPeriod) {
    reasons.push("Zero hours this period for a previously active VA");
  }
  if (i.needsReviewDays > 0) {
    reasons.push(`${i.needsReviewDays} tracker day(s) marked needs-review`);
  }
  if (i.newProjects.length > 0) {
    reasons.push(`New project(s) this period: ${i.newProjects.join(", ")}`);
  }
  return reasons;
}
```

- [ ] **Step 4: PASS** — `npm test 2>&1 | grep -A6 anomal` → 6 passing.

- [ ] **Step 5: Wire into recalculation.** In `src/lib/actions/payroll.ts` `recalculateOpenPeriod`, after `rows` are computed and before the transaction, assemble flags:

```ts
import { detectAnomalies } from "@/lib/services/payroll-anomalies";
// ...
  const source = activeHoursSource(); // already created earlier in this function
  const weeksInPeriod = (period.periodEnd.getTime() - period.periodStart.getTime()) / (7 * 24 * 60 * 60 * 1000) + 1 / 7;
  const [trailing, breakdownRows, priorBreakdown, settings] = await Promise.all([
    db.payrollCalculation.findMany({
      where: { vaId: { in: vaIds }, periodStart: { lt: period.periodStart } },
      orderBy: { periodStart: "desc" },
      take: 3 * vaIds.length,
      select: { vaId: true, periodStart: true, hoursInPeriod: true },
    }),
    source.breakdown(period.periodStart, period.periodEnd, vaIds),
    source.breakdown(new Date(period.periodStart.getTime() - 90 * 24 * 60 * 60 * 1000), new Date(period.periodStart.getTime() - 1), vaIds),
    db.setting.findUnique({ where: { key: "payroll_spike_multiplier" }, select: { value: true } }),
  ]);
  const spikeMultiplier = Number(settings?.value) > 1 ? Number(settings?.value) : 1.5;
  const trailingByVa = new Map<string, number[]>();
  for (const t of trailing) {
    const arr = trailingByVa.get(t.vaId) ?? [];
    if (arr.length < 3) arr.push(t.hoursInPeriod);
    trailingByVa.set(t.vaId, arr);
  }
  const knownProjects = new Map<string, Set<string>>();
  for (const b of priorBreakdown) {
    if (!b.project) continue;
    (knownProjects.get(b.vaId) ?? knownProjects.set(b.vaId, new Set()).get(b.vaId)!).add(b.project);
  }
  const periodProjects = new Map<string, Set<string>>();
  const reviewDays = new Map<string, number>();
  for (const b of breakdownRows) {
    if (b.project) (periodProjects.get(b.vaId) ?? periodProjects.set(b.vaId, new Set()).get(b.vaId)!).add(b.project);
    if (b.needsReview) reviewDays.set(b.vaId, (reviewDays.get(b.vaId) ?? 0) + 1);
  }
  const vaMeta = new Map(vas.map((v) => [v.vaId, v]));
  const flagsByVa = new Map<string, string[]>();
  for (const row of rows) {
    const trail = trailingByVa.get(row.vaId) ?? [];
    flagsByVa.set(
      row.vaId,
      detectAnomalies({
        hoursInPeriod: row.hoursInPeriod,
        trailingPeriodHours: trail,
        targetHoursWeekly: vaMeta.get(row.vaId)?.targetHoursWeekly ?? null,
        weeksInPeriod,
        needsReviewDays: reviewDays.get(row.vaId) ?? 0,
        newProjects: [...(periodProjects.get(row.vaId) ?? [])].filter((p) => !(knownProjects.get(row.vaId)?.has(p) ?? false)),
        wasActiveLastPeriod: trail.length > 0 && trail[0]! > 0,
        spikeMultiplier,
      }),
    );
  }
```

(Note: `vas` select in this function must add `targetHoursWeekly: true`.) Then each upsert's `update`/`create` gains:

```ts
          flagged: (flagsByVa.get(row.vaId) ?? []).length > 0,
          flagReasons: flagsByVa.get(row.vaId) ?? [],
```

- [ ] **Step 6: Typecheck + full suite** — `npx tsc --noEmit && npm test 2>&1 | grep -E "^# (pass|fail)"` → clean/baseline.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/payroll-anomalies.ts tests/payroll-anomalies.test.ts src/lib/actions/payroll.ts
git commit -m "feat(payroll): anomaly detection — spike/target/zero-hours/needs-review/new-project flags on recalc"
```

---

### Task 8: Row approval API + supervisor permission

**Files:**
- Create: `src/lib/auth/payroll-approval.ts`
- Create: `src/app/api/payroll/rows/route.ts`
- Test: `tests/payroll-approval.test.ts`

- [ ] **Step 1: Permission helper + failing test**

```ts
// tests/payroll-approval.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { canApproveRow } from "../src/lib/auth/payroll-approval";

test("admin and HR_MANAGER approve anyone; bookkeeper does not approve", () => {
  assert.equal(canApproveRow({ isAdmin: true, role: "BOOKKEEPER", vaId: null }, "va9"), true);
  assert.equal(canApproveRow({ isAdmin: false, role: "HR_MANAGER", vaId: null }, "va9"), true);
  assert.equal(canApproveRow({ isAdmin: false, role: "BOOKKEEPER", vaId: null }, "va9"), false);
});

test("a supervisor approves only their own reports", () => {
  const sup = { isAdmin: false, role: "VA" as const, vaId: "sup1" };
  assert.equal(canApproveRow(sup, "sup1"), true, "supervisorVaId matches");
  assert.equal(canApproveRow(sup, "other"), false);
});
```

```ts
// src/lib/auth/payroll-approval.ts
// Who may approve a payroll row (proposal §11): HR_MANAGER / admin approve
// anyone; a VA login approves rows whose Va.supervisorVaId is THEIR vaId.
// Rides the existing Supervision relation — NOT a hardcoded role (review §14).
import type { Role } from "@prisma/client";

export function canApproveRow(
  actor: { isAdmin: boolean; role: Role | string; vaId: string | null },
  rowSupervisorVaId: string | null,
): boolean {
  if (actor.isAdmin || actor.role === "HR_MANAGER") return true;
  return !!actor.vaId && !!rowSupervisorVaId && actor.vaId === rowSupervisorVaId;
}
```

Run FAIL → implement → `npm test 2>&1 | grep -A3 approval` → PASS.

- [ ] **Step 2: The rows op-dispatch API**

```ts
// src/app/api/payroll/rows/route.ts
import type { Role } from "@prisma/client";
import { action, str } from "@/lib/api";
import { db } from "@/lib/db";
import { canApproveRow } from "@/lib/auth/payroll-approval";
import { logActivity } from "@/lib/activity";

// Payroll row status ops. Broad allow (payroll staff + any VA login — VAs may
// be supervisors); per-op checks enforce who can approve WHOSE row.
const allow = (role: Role) => ["BOOKKEEPER", "HR_MANAGER", "PEOPLE_OPS", "VA", "SENIOR_VA", "TEAM_LEAD"].includes(role);

export const POST = action(
  async (body, user) => {
    const op = str(body, "op");

    async function loadRow(id: string) {
      const row = await db.payrollCalculation.findUnique({ where: { id } });
      if (!row) throw new Error("Row not found.");
      const period = await db.payrollPeriod.findUnique({ where: { periodStart: row.periodStart } });
      if (period?.status !== "open") throw new Error("Period is locked — reopen it to change rows.");
      const va = await db.va.findUnique({ where: { vaId: row.vaId }, select: { supervisorVaId: true } });
      return { row, supervisorVaId: va?.supervisorVaId ?? null };
    }

    switch (op) {
      case "approve": {
        const { row, supervisorVaId } = await loadRow(str(body, "id"));
        if (!canApproveRow(user, supervisorVaId)) throw new Error("You can only approve your own reports' hours.");
        if (row.flagged && !(user.isAdmin || user.role === "HR_MANAGER")) {
          throw new Error("Flagged rows need HR review before approval.");
        }
        return db.payrollCalculation.update({
          where: { id: row.id },
          data: { rowStatus: "approved", approvedByEmail: user.email, approvedAt: new Date() },
        });
      }
      case "unapprove": {
        const { row, supervisorVaId } = await loadRow(str(body, "id"));
        if (!canApproveRow(user, supervisorVaId)) throw new Error("Not your report.");
        return db.payrollCalculation.update({
          where: { id: row.id },
          data: { rowStatus: "submitted", approvedByEmail: null, approvedAt: null },
        });
      }
      case "exclude": {
        if (!user.isAdmin && user.role !== "HR_MANAGER") throw new Error("Only HR can exclude a row.");
        const { row } = await loadRow(str(body, "id"));
        return db.payrollCalculation.update({
          where: { id: row.id },
          data: { rowStatus: "excluded", excludedReason: str(body, "reason") || "Excluded by HR" },
        });
      }
      case "bulk_approve_trusted": {
        // Approve every submitted, UNFLAGGED row of a trusted VA that this
        // actor is allowed to approve (proposal §6.3).
        const period = await db.payrollPeriod.findFirst({ where: { status: "open" }, orderBy: { periodStart: "desc" } });
        if (!period) throw new Error("No open period.");
        const rows = await db.payrollCalculation.findMany({
          where: { periodStart: period.periodStart, rowStatus: "submitted", flagged: false },
        });
        const vas = await db.va.findMany({
          where: { vaId: { in: rows.map((r) => r.vaId) } },
          select: { vaId: true, supervisorVaId: true, trustedForBulkApprove: true },
        });
        const meta = new Map(vas.map((v) => [v.vaId, v]));
        const eligible = rows.filter((r) => {
          const m = meta.get(r.vaId);
          return m?.trustedForBulkApprove && canApproveRow(user, m.supervisorVaId ?? null);
        });
        await db.payrollCalculation.updateMany({
          where: { id: { in: eligible.map((r) => r.id) } },
          data: { rowStatus: "approved", approvedByEmail: user.email, approvedAt: new Date() },
        });
        await logActivity({
          source: "payroll_action",
          eventType: "rows_bulk_approved",
          summary: `${eligible.length} trusted rows approved by ${user.email}`,
        });
        return { approved: eligible.length };
      }
      default:
        throw new Error(`Unknown op: ${op}`);
    }
  },
  { allow },
);
```

**Note:** match `action()`'s exact signature from `src/lib/api.ts` (look at `src/app/api/hr/sales/route.ts` for the calling convention) — if the handler receives `(body, user)` in a different order or shape, follow the house pattern.

- [ ] **Step 3: Wire buttons into `PayrollDashboardClient`** — per row: `Approve` (solid navy pill; hidden unless status `submitted`), `Undo` (ghost; when `approved`), `Exclude…` (ghost, HR only, prompt for reason); toolbar button `Approve all trusted` → `bulk_approve_trusted`, toast `"N rows approved."`. All via `postJson("/api/payroll/rows", {...})`, optimistic update + rollback on `!res.ok` (the `postJson` helper already resolves network failures to `ok:false`).

- [ ] **Step 4: Typecheck + curl smoke**

```bash
npx tsc --noEmit
(nohup npm run dev > /tmp/va-dev.log 2>&1 &) ; sleep 10
curl -s -X POST http://localhost:3032/api/payroll/rows -H 'Content-Type: application/json' -d '{"op":"bulk_approve_trusted"}'
kill $(lsof -ti:3032)
```

Expected: `{"ok":true,...}` or a clean domain error (`No open period.`) — not a 500.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/payroll-approval.ts tests/payroll-approval.test.ts src/app/api/payroll/rows/ src/components/payroll/PayrollDashboardClient.tsx
git commit -m "feat(payroll): row approval flow — supervisor/HR approve, exclude, bulk-approve trusted"
```

---

### Task 9: Lock gate — a period locks only when every row is resolved

**Files:**
- Modify: `src/lib/actions/payroll.ts:182-200` (`lockOpenPeriod`)
- Test: extend `tests/payroll.test.ts` only if it already unit-tests actions (it tests the pure calc — if so, skip test, this is a 6-line guard).

- [ ] **Step 1: Add the guard** at the top of `lockOpenPeriod`, before `recalculateOpenPeriod()`:

```ts
  // Approval gate (proposal §6.2): every row must be approved or excluded.
  const open = await db.payrollPeriod.findFirst({ where: { status: "open" }, orderBy: { periodStart: "desc" } });
  if (open) {
    const unresolved = await db.payrollCalculation.count({
      where: { periodStart: open.periodStart, rowStatus: { in: ["submitted"] } },
    });
    if (unresolved > 0) {
      throw new Error(`Cannot lock: ${unresolved} row(s) still awaiting approval.`);
    }
  }
```

**Caution:** `lockOpenPeriod` calls `recalculateOpenPeriod`, which resets rows to `submitted` — that would always trip the gate. Fix the interaction: `recalculateOpenPeriod` must NOT reset `approved` rows *when the hours/gross are unchanged*. In the upsert `update` block, change the reset to preserve status when nothing moved — compute per row:

```ts
          // Only re-submit if the money actually changed; a no-op recalc
          // (e.g. from lock) must not wipe approvals.
```

Implement by loading current rows before the transaction:

```ts
  const current = new Map(
    (
      await db.payrollCalculation.findMany({
        where: { periodStart: period.periodStart },
        select: { vaId: true, hoursInPeriod: true, grossPay: true, rowStatus: true },
      })
    ).map((r) => [r.vaId, r]),
  );
```

and in the `update` object:

```ts
          rowStatus: excluded.has(row.vaId)
            ? "excluded"
            : current.get(row.vaId)?.rowStatus === "approved" &&
                current.get(row.vaId)?.hoursInPeriod === row.hoursInPeriod &&
                current.get(row.vaId)?.grossPay === row.grossPay
              ? "approved"
              : "submitted",
```

(keep `approvedByEmail`/`approvedAt` nulling only in the re-submit case — use the same ternary: when preserving `approved`, don't touch them; simplest is to build the `update` object conditionally in code rather than inline.)

- [ ] **Step 2: Typecheck + suite** — `npx tsc --noEmit && npm test 2>&1 | grep -E "^# (pass|fail)"` → clean/baseline.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/payroll.ts
git commit -m "feat(payroll): lock gate — period locks only when all rows approved/excluded; recalc preserves unchanged approvals"
```

---

### Task 10: Project → client mapping screen (needs-mapping queue)

**Files:**
- Create: `src/app/(app)/payroll/mapping/page.tsx`
- Create: `src/components/payroll/ProjectMappingClient.tsx`
- Create: `src/app/api/payroll/mapping/route.ts`
- Modify: `src/components/Sidebar.tsx:82-90` (PAYROLL nav: add `{ href: "/payroll/mapping", label: "Client Mapping", icon: <IconBuilding /> }` — import `IconBuilding`)

- [ ] **Step 1: API**

```ts
// src/app/api/payroll/mapping/route.ts
import type { Role } from "@prisma/client";
import { action, str, optStr } from "@/lib/api";
import { db } from "@/lib/db";

const allow = (role: Role) => role === "BOOKKEEPER" || role === "HR_MANAGER" || role === "PEOPLE_OPS";

export const POST = action(
  async (body, user) => {
    const op = str(body, "op");
    if (op === "map") {
      // clientOrgId "" → internal PWA work (null)
      return db.clientProjectMap.upsert({
        where: { project: str(body, "project") },
        update: { clientOrgId: optStr(body, "clientOrgId") || null, createdByEmail: user.email },
        create: { project: str(body, "project"), clientOrgId: optStr(body, "clientOrgId") || null, createdByEmail: user.email },
      });
    }
    if (op === "unmap") {
      await db.clientProjectMap.delete({ where: { project: str(body, "project") } });
      return { ok: true };
    }
    throw new Error(`Unknown op: ${op}`);
  },
  { allow },
);
```

- [ ] **Step 2: Page (server)** — guard like `/payroll`, then load:

```ts
// distinct project strings seen in the last 120 days, via the hours source
const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
const rows = await activeHoursSource().breakdown(since, new Date());
const projectHours = new Map<string, number>();
for (const r of rows) if (r.project) projectHours.set(r.project, (projectHours.get(r.project) ?? 0) + r.hours);
const [maps, orgs] = await Promise.all([
  db.clientProjectMap.findMany(),
  db.clientOrganization.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
]);
```

Pass `{ projects: [{project, hours, mappedTo}], orgs }` to the client component. Page-head copy: crumb "Payroll", h1 "Project → client mapping", sub "Every tracker project maps to a client (or Internal) so payroll hours are attributable. Unmapped projects can't feed the billing view."

- [ ] **Step 3: Client component** — two sections: **Needs mapping** (projects with no `ClientProjectMap` row, sorted by hours desc — each row: project name, hours badge, org `<select>` (options: "— pick client —", "Internal (PWA)" value `""` sentinel `internal`, then orgs) + Map button) and **Mapped** (project → client name chip, Change/Unmap ghost buttons). Use `postJson("/api/payroll/mapping", …)` + `useToast`. Note: distinguish "Internal" mapping (row exists, clientOrgId null) from unmapped (no row) — the select for Internal sends `clientOrgId: ""` and the API stores null; the section split keys on row existence, not clientOrgId.

- [ ] **Step 4: Verify** — dev server: `/payroll/mapping` → 200, map a project, confirm it moves sections, and the Task 6 drill-down now shows the client name.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/payroll/mapping/ src/components/payroll/ProjectMappingClient.tsx src/app/api/payroll/mapping/ src/components/Sidebar.tsx
git commit -m "feat(payroll): project-to-client mapping screen with needs-mapping queue"
```

---

### Task 11: Payment profile editor (method + currency only)

**Files:**
- Modify: `src/components/payroll/PayrollDashboardClient.tsx` (row expand gains an "Payment profile" mini-form, HR/bookkeeper only)
- Modify: `src/app/api/payroll/rows/route.ts` (add op)

- [ ] **Step 1: Add the op** to `/api/payroll/rows`:

```ts
      case "set_payment_profile": {
        if (!user.isAdmin && user.role !== "HR_MANAGER" && user.role !== "BOOKKEEPER") {
          throw new Error("Only HR/bookkeeper can edit payment profiles.");
        }
        const method = str(body, "method");
        if (!["WISE", "REMITLY", "PAYONEER", "GREY"].includes(method)) throw new Error("Invalid method.");
        const payoutCurrency = (optStr(body, "payoutCurrency") || "USD").toUpperCase().slice(0, 3);
        return db.vaPaymentProfile.upsert({
          where: { vaId: str(body, "vaId") },
          update: { method, payoutCurrency },
          create: { vaId: str(body, "vaId"), method, payoutCurrency },
        });
      }
```

(add `optStr` to the imports if not already there)

- [ ] **Step 2: UI** — in the drill-down panel, HR/bookkeeper see: method `<select>` (Wise/Remitly/Payoneer/Grey) + currency text input (3 chars) + Save ghost button → op above; toast "Payment profile saved."; update the row's method/currency chips optimistically. Pass an `canEditProfiles` boolean prop from the server page (`user.isAdmin || role BOOKKEEPER/HR_MANAGER`).

**Recipient identifiers (bank/account refs) are deliberately NOT in this form** — Phase 3, behind the encryption gate.

- [ ] **Step 3: Typecheck, verify, commit**

```bash
npx tsc --noEmit
git add src/app/api/payroll/rows/route.ts src/components/payroll/PayrollDashboardClient.tsx src/app/\(app\)/payroll/page.tsx
git commit -m "feat(payroll): per-VA payment method/currency profile (no recipient details until Phase 3)"
```

---

### Task 12: Trusted-VA flag on the registry + history polish

**Files:**
- Modify: the VA registry edit surface (`src/app/(app)/hr/registry/` — find the VA edit form/actions and add the checkbox) — grep `targetHoursWeekly` under `src/` to find the exact form + action that persists Va fields; add `trustedForBulkApprove` alongside.
- Modify: `src/app/(app)/payroll/archive/page.tsx` — add per-row status counts to each past period row (one `db.payrollCalculation.groupBy({ by: ["periodStart", "rowStatus"], _count: true })` query).

- [ ] **Step 1: Registry checkbox** — label: "Trusted for payroll bulk-approve", help text "Unflagged rows for this VA can be approved in one click. Anomaly-flagged rows always need individual review." Persist through the same server action that saves the other Va fields.

- [ ] **Step 2: Archive counts** — each past period row gains `"N approved · M excluded"` small text.

- [ ] **Step 3: Full verification pass**

```bash
npx tsc --noEmit && npm test 2>&1 | grep -E "^# (pass|fail)"
rm -rf .next && npm run build 2>&1 | tail -3   # prod build must be clean
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(payroll): trusted-VA flag in registry; archive status counts"
```

---

### Task 13: Deploy to the shared dev box + verify

**Target: dev-team.pwasecondbrain.uk (IONOS). NOT discovery.pwasecondbrain.uk.**

- [ ] **Step 1: Pre-deploy check (deploy-verify-shared-dev rule)** — see what's on the box before pushing:

```bash
ssh root@74.208.40.108 'cd /app/SecondBrain/va-management-console/current && git log --oneline -3 2>/dev/null || echo not-git'
```

If the box carries an unmerged branch (e.g. `feature/profiles-birthdays`), STOP and ask Justin how to sequence — do not clobber.

- [ ] **Step 2: Deploy** — per the repo's `./deploy.sh dev` (it handles build + migrate + restart). If deploying the branch directly is needed instead of merging to main first, follow whatever the script expects — read `deploy.sh` before running it.

- [ ] **Step 3: Verify with a real page load + journal** (not just /api/health):

```bash
ssh root@74.208.40.108 'curl -s -o /dev/null -w "/payroll %{http_code}\n" http://127.0.0.1:<devport>/payroll; journalctl -u va-management-web --since "5 min ago" -p err --no-pager | tail -5'
```

Expected: 200, no errors. Then load `/payroll` in the browser as the admin, approve a row, run bulk-approve, expand a drill-down, map a project.

- [ ] **Step 4: Update the Notion proposal page** — build-update note per the `pw-os-update` conventions, and flip the plan status line.

---

# Deferred phases (separate plans — do not start)

## Phase 3 — Payments (BLOCKED by the Pre-Phase-3 gate on the proposal page)

Scope when unblocked: encrypted recipient identifiers on `VaPaymentProfile` (dedicated env key, not plaintext — decide envelope format first), `PaymentBatch`/`PaymentRecord` models with a **unique idempotency key per (vaId, periodStart)**, payout manifest CSVs per method, Wise Batch Groups API in sandbox → live, webhook status updates, `PAYROLL_PAY_MODE=mock|live` env gate mirroring `STRIPE_MODE`, and a typed human confirmation before any live batch. Every gate checkbox on the Notion page must be checked before this plan is written.

## Phase 4 — Billing & margin

Scope: `ClientBillingRate` (per client org **per tier** — review §14), Billing & Margin tab (revenue = hours × bill rate; cost = hours × pay rate; margin $ / % / trend), pricing calculator reading live tier rates. **Precondition:** `ClientProjectMap` coverage ≥ ~95% of logged hours (the tab ships labeled "directional" below that). Efficiency-in-payroll and the HR efficiency trend view also land here (§9).

---

# Self-review notes (against the proposal)

- §3 tiles → Task 5/6 · §4 schedule → Tasks 1/4 · §5 table → Tasks 5/6 · §6.1 hours-per-client → Tasks 5 (breakdown) + 10 (map) · §6.2 status flow → Tasks 3/8/9 · §6.3 bulk-approve → Tasks 8/12 · §6.4 anomalies → Task 7 · §7.1 profiles → Tasks 3/11 (method+currency; recipient details deferred to Phase 3 by design) · §7.2–7.3 → Phase 3 plan · §8 → Phase 4 plan · §9 → partial (efficiency % shown in drill-down, Task 5; full views in Phase 4) · §10 models → Task 3 (Phase-1/2 subset) · §11 roles → Tasks 8 (approval), 6/11 (visibility props) · §12 phasing → this plan = Phases 1–2.
- The `Submitted → Approved` reset-on-recalc interaction (Task 9) is the subtlest part — the recalc preserves approvals only for rows whose hours AND gross are unchanged.
- VA self-view ("see own hours/pay breakdown", §11) is satisfied by the breakdown API permitting `user.vaId === vaId`; a VA-console surface for it is not in this plan (add to Phase 4 or a VA-console follow-up if wanted).
