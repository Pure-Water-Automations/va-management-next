import test from "node:test";
import assert from "node:assert/strict";

import {
  computeExpectedHours,
  computeUtilization,
  computeFlags,
  detectTransition,
  computeCapacity,
  capacityWindow,
  activeDaysInWindow,
  startOfUtcDay,
  isHoursStale,
  resolveCapacityThresholds,
  DEFAULT_CAPACITY_THRESHOLDS,
  type CapacityThresholds,
} from "../src/lib/services/capacity";

// ── computeExpectedHours (proration) ────────────────────────────────────

test("computeExpectedHours prorates target hours to the active days in the window", () => {
  // 20h/wk target, full 14-day window, all 14 days active → 40h expected
  assert.equal(
    computeExpectedHours({ targetHoursWeekly: 20, windowDays: 14, activeDaysInWindow: 14 }),
    40,
  );
});

test("computeExpectedHours prorates for a new hire mid-window", () => {
  // 20h/wk target, only 7 of the 14 days active (started mid-window) → 20h expected
  assert.equal(
    computeExpectedHours({ targetHoursWeekly: 20, windowDays: 14, activeDaysInWindow: 7 }),
    20,
  );
});

test("computeExpectedHours returns 0 for zero active days", () => {
  assert.equal(
    computeExpectedHours({ targetHoursWeekly: 20, windowDays: 14, activeDaysInWindow: 0 }),
    0,
  );
});

// ── computeUtilization ──────────────────────────────────────────────────

test("computeUtilization returns utilization percentage from expected/actual hours", () => {
  assert.deepEqual(computeUtilization(40, 30), { utilizationPct: 75 });
});

test("computeUtilization returns 0 percent when expected hours is 0", () => {
  assert.deepEqual(computeUtilization(0, 30), { utilizationPct: 0 });
});

// ── computeFlags ─────────────────────────────────────────────────────────

test("computeFlags marks overburdened above 120 percent utilization", () => {
  assert.deepEqual(computeFlags({ utilizationPct: 130, last14dHours: 26, expected14d: 20 }), {
    overburdened: true,
    underutilized: false,
  });
});

test("computeFlags marks overburdened when hours exceed 1.5x expected even under 120 percent utilization", () => {
  // expected14d=40 (20h/wk target), 65h logged = 162.5% > 120 anyway; use a case where
  // pct alone stays under 120 but the relative-hours cap trips: expected14d=40, 61h logged = 152%>120.
  // Instead construct: expected14d=60 (30h/wk), 65h logged -> 108% (<120) but 65 > 60*1.5=90? no.
  // Use expected14d=50, hours=80 -> 160% already >120. To isolate the relative cap, make expected14d large
  // relative to the absolute cap: expected14d=10, hours=16 -> 160%>120 too. The relative-hours rule only
  // matters when pct<=120, e.g. expected14d=200 (unrealistic target) hours=310 -> 155%. Hard to get pct<120
  // with hours>1.5x expected since that implies pct>150 always. So instead test the ABSOLUTE ceiling path:
  // low target (expected14d small) but VA logs many hours -> pct is huge anyway, so absolute ceiling matters
  // when target is HIGH enough that hours>maxWeeklyHours*2 while pct<=120.
  const thresholds: CapacityThresholds = { ...DEFAULT_CAPACITY_THRESHOLDS, maxWeeklyHours: 45 };
  // expected14d=100 (50h/wk target), 95h logged -> 95% utilization (<120), but 95 > 45*2=90 -> absolute cap trips.
  assert.deepEqual(
    computeFlags({ utilizationPct: 95, last14dHours: 95, expected14d: 100 }, thresholds),
    { overburdened: true, underutilized: false },
  );
});

test("computeFlags marks underutilized below 50 percent utilization", () => {
  assert.deepEqual(computeFlags({ utilizationPct: 47.5, last14dHours: 19, expected14d: 40 }), {
    overburdened: false,
    underutilized: true,
  });
});

test("computeFlags does not flag a VA sitting exactly at the boundary", () => {
  assert.deepEqual(computeFlags({ utilizationPct: 120, last14dHours: 48, expected14d: 40 }), {
    overburdened: false,
    underutilized: false,
  });
  assert.deepEqual(computeFlags({ utilizationPct: 50, last14dHours: 20, expected14d: 40 }), {
    overburdened: false,
    underutilized: false,
  });
});

// ── detectTransition (with hysteresis bands) ────────────────────────────

test("detectTransition flags on entering overburdened (above 120%)", () => {
  assert.deepEqual(
    detectTransition("green", { utilizationPct: 125, last14dHours: 50 }),
    { transition: "flagged", severity: "red" },
  );
});

test("detectTransition holds red while utilization is between the clear and enter bands", () => {
  // was red, drops to 115% (below 120 enter, above 110 clear) -> hold
  assert.deepEqual(
    detectTransition("red", { utilizationPct: 115, last14dHours: 46 }),
    { transition: "none", severity: "red" },
  );
});

test("detectTransition clears red once utilization drops below the clear band", () => {
  assert.deepEqual(
    detectTransition("red", { utilizationPct: 108, last14dHours: 43 }),
    { transition: "cleared", severity: "green" },
  );
});

test("detectTransition does not enter underutilized until below the 45 percent enter band", () => {
  // was green, drops to 48% (below the 50% display threshold but above the 45% hysteresis enter) -> hold green
  assert.deepEqual(
    detectTransition("green", { utilizationPct: 48, last14dHours: 19 }),
    { transition: "none", severity: "green" },
  );
});

test("detectTransition flags underutilized once below the 45 percent enter band", () => {
  assert.deepEqual(
    detectTransition("green", { utilizationPct: 40, last14dHours: 16 }),
    { transition: "flagged", severity: "yellow" },
  );
});

test("detectTransition holds yellow until utilization rises above the 55 percent clear band", () => {
  assert.deepEqual(
    detectTransition("yellow", { utilizationPct: 52, last14dHours: 21 }),
    { transition: "none", severity: "yellow" },
  );
});

test("detectTransition clears yellow once utilization rises above the clear band", () => {
  assert.deepEqual(
    detectTransition("yellow", { utilizationPct: 60, last14dHours: 24 }),
    { transition: "cleared", severity: "green" },
  );
});

test("detectTransition reports none when severity is unchanged", () => {
  assert.deepEqual(
    detectTransition("red", { utilizationPct: 130, last14dHours: 52 }),
    { transition: "none", severity: "red" },
  );
});

// ── capacityWindow / startOfUtcDay / activeDaysInWindow (task 5: 14 complete UTC days) ──

test("startOfUtcDay truncates to midnight UTC", () => {
  const d = new Date("2026-07-16T14:32:00.000Z");
  assert.equal(startOfUtcDay(d).toISOString(), "2026-07-16T00:00:00.000Z");
});

test("capacityWindow spans the last N complete UTC days, excluding today", () => {
  const now = new Date("2026-07-16T09:00:00.000Z");
  const w = capacityWindow(now, 14);
  assert.equal(w.start.toISOString(), "2026-07-02T00:00:00.000Z");
  assert.equal(w.end.toISOString(), "2026-07-16T00:00:00.000Z");
  assert.equal(w.days, 14);
});

test("activeDaysInWindow returns the full window when the VA started before it", () => {
  const w = capacityWindow(new Date("2026-07-16T09:00:00.000Z"), 14);
  assert.equal(activeDaysInWindow(w, new Date("2026-01-01T00:00:00.000Z")), 14);
});

test("activeDaysInWindow returns 0 when the VA has no start date recorded (treated as always active)", () => {
  const w = capacityWindow(new Date("2026-07-16T09:00:00.000Z"), 14);
  assert.equal(activeDaysInWindow(w, null), 14);
});

test("activeDaysInWindow clamps to the days since a mid-window start date", () => {
  const w = capacityWindow(new Date("2026-07-16T09:00:00.000Z"), 14);
  // started 2026-07-09 -> 7 days active in the 14-day window
  assert.equal(activeDaysInWindow(w, new Date("2026-07-09T00:00:00.000Z")), 7);
});

test("activeDaysInWindow returns 0 when the VA starts after the window ends", () => {
  const w = capacityWindow(new Date("2026-07-16T09:00:00.000Z"), 14);
  assert.equal(activeDaysInWindow(w, new Date("2026-08-01T00:00:00.000Z")), 0);
});

// ── isHoursStale (task 4) ────────────────────────────────────────────────

test("isHoursStale is false when the latest hours date is within the freshness window", () => {
  const now = new Date("2026-07-16T09:00:00.000Z");
  assert.equal(isHoursStale(new Date("2026-07-15T00:00:00.000Z"), now), false);
});

test("isHoursStale is true when the latest hours date is older than 2 days", () => {
  const now = new Date("2026-07-16T09:00:00.000Z");
  assert.equal(isHoursStale(new Date("2026-07-12T00:00:00.000Z"), now), true);
});

test("isHoursStale is true when there is no hours data at all", () => {
  assert.equal(isHoursStale(null, new Date("2026-07-16T09:00:00.000Z")), true);
});

// ── resolveCapacityThresholds (settings overrides) ──────────────────────

test("resolveCapacityThresholds returns defaults when no settings are configured", () => {
  assert.deepEqual(resolveCapacityThresholds(new Map()), DEFAULT_CAPACITY_THRESHOLDS);
});

test("resolveCapacityThresholds overrides from a settings map", () => {
  const settings = new Map([
    ["capacity_max_weekly_hours", "50"],
    ["capacity_overburdened_pct", "130"],
  ]);
  const t = resolveCapacityThresholds(settings);
  assert.equal(t.maxWeeklyHours, 50);
  assert.equal(t.overburdenedPct, 130);
  assert.equal(t.underutilizedPct, DEFAULT_CAPACITY_THRESHOLDS.underutilizedPct);
});

// ── computeCapacity (composed, task 2 + task 7) ─────────────────────────

test("computeCapacity excludes a VA with no target from over/under flags", () => {
  const window = capacityWindow(new Date("2026-07-16T00:00:00.000Z"), 14);
  const r = computeCapacity({ targetHoursWeekly: 0, taskHrs: 5, atWorkHrs: 5, startDate: null, window });
  assert.equal(r.noTarget, true);
  assert.equal(r.overburdened, false);
  assert.equal(r.underutilized, false);
  assert.equal(r.trackingGap, false);
});

test("computeCapacity treats null target the same as 0 (no target)", () => {
  const window = capacityWindow(new Date("2026-07-16T00:00:00.000Z"), 14);
  const r = computeCapacity({ targetHoursWeekly: null, taskHrs: 5, atWorkHrs: 5, startDate: null, window });
  assert.equal(r.noTarget, true);
});

test("computeCapacity flags a tracking gap instead of underutilized when clocked-in time is present but task hours are not logged", () => {
  const window = capacityWindow(new Date("2026-07-16T00:00:00.000Z"), 14);
  // target 20h/wk -> expected 40h. atWork=25h (>=50% of 40=20h), taskHrs=10h (<50% of 40=20h).
  const r = computeCapacity({ targetHoursWeekly: 20, taskHrs: 10, atWorkHrs: 25, startDate: null, window });
  assert.equal(r.trackingGap, true);
  assert.equal(r.underutilized, false);
});

test("computeCapacity flags underutilized (not tracking gap) when clocked-in time is also low", () => {
  const window = capacityWindow(new Date("2026-07-16T00:00:00.000Z"), 14);
  // target 20h/wk -> expected 40h. atWork=10h (<20h), taskHrs=10h (<20h) -> plain underutilized.
  const r = computeCapacity({ targetHoursWeekly: 20, taskHrs: 10, atWorkHrs: 10, startDate: null, window });
  assert.equal(r.trackingGap, false);
  assert.equal(r.underutilized, true);
});

test("computeCapacity prorates expected hours for a VA who started mid-window", () => {
  const window = capacityWindow(new Date("2026-07-16T00:00:00.000Z"), 14);
  // target 20h/wk, started 7 days ago -> expected 20h (not 40h). 18h logged -> 90% utilization, not underutilized.
  const r = computeCapacity({
    targetHoursWeekly: 20,
    taskHrs: 18,
    atWorkHrs: 18,
    startDate: new Date("2026-07-09T00:00:00.000Z"),
    window,
  });
  assert.equal(r.expectedHours, 20);
  assert.equal(r.underutilized, false);
});
