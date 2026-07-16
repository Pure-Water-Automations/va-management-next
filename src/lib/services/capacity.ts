import { num } from "@/lib/settings";

const DAY_MS = 24 * 60 * 60 * 1000;

export type CapacityFlags = {
  overburdened: boolean;
  underutilized: boolean;
};

export type CapacitySeverity = "red" | "yellow" | "green";

export type CapacityTransition = {
  transition: "flagged" | "cleared" | "none";
  severity: CapacitySeverity;
};

export type CapacityThresholds = {
  overburdenedPct: number; // display flag + hysteresis enter threshold
  overburdenedClearPct: number; // hysteresis clear threshold
  underutilizedPct: number; // display flag threshold
  underutilizedEnterPct: number; // hysteresis enter threshold
  underutilizedClearPct: number; // hysteresis clear threshold
  relativeHoursMultiplier: number; // absolute-cap rule: last14dHours > expected14d * this
  maxWeeklyHours: number; // absolute ceiling: last{window}dHours > maxWeeklyHours * (windowDays/7)
  trackingGapPct: number; // % of expected hours used for the tracking-gap comparison
};

export const DEFAULT_CAPACITY_THRESHOLDS: CapacityThresholds = {
  overburdenedPct: 120,
  overburdenedClearPct: 110,
  underutilizedPct: 50,
  underutilizedEnterPct: 45,
  underutilizedClearPct: 55,
  relativeHoursMultiplier: 1.5,
  maxWeeklyHours: 45,
  trackingGapPct: 50,
};

/** Parse CapacityThresholds overrides out of a loaded settings map (task 1). */
export function resolveCapacityThresholds(settings: Map<string, string>): CapacityThresholds {
  return {
    overburdenedPct: num(settings, "capacity_overburdened_pct", DEFAULT_CAPACITY_THRESHOLDS.overburdenedPct),
    overburdenedClearPct: num(settings, "capacity_overburdened_clear_pct", DEFAULT_CAPACITY_THRESHOLDS.overburdenedClearPct),
    underutilizedPct: num(settings, "capacity_underutilized_pct", DEFAULT_CAPACITY_THRESHOLDS.underutilizedPct),
    underutilizedEnterPct: num(settings, "capacity_underutilized_enter_pct", DEFAULT_CAPACITY_THRESHOLDS.underutilizedEnterPct),
    underutilizedClearPct: num(settings, "capacity_underutilized_clear_pct", DEFAULT_CAPACITY_THRESHOLDS.underutilizedClearPct),
    relativeHoursMultiplier: num(settings, "capacity_relative_hours_multiplier", DEFAULT_CAPACITY_THRESHOLDS.relativeHoursMultiplier),
    maxWeeklyHours: num(settings, "capacity_max_weekly_hours", DEFAULT_CAPACITY_THRESHOLDS.maxWeeklyHours),
    trackingGapPct: num(settings, "capacity_tracking_gap_pct", DEFAULT_CAPACITY_THRESHOLDS.trackingGapPct),
  };
}

// ── Window + proration (tasks 3 + 5) ────────────────────────────────────

export type CapacityWindow = { start: Date; end: Date; days: number };

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** The last `windowDays` COMPLETE UTC days: [today-windowDays, today) — excludes today. */
export function capacityWindow(now: Date, windowDays = 14): CapacityWindow {
  const end = startOfUtcDay(now);
  const start = new Date(end.getTime() - windowDays * DAY_MS);
  return { start, end, days: windowDays };
}

/** Days of the window on/after a VA's start date; a missing start date means "always active". */
export function activeDaysInWindow(window: CapacityWindow, startDate: Date | null | undefined): number {
  if (!startDate) return window.days;
  const clampedStart = startDate.getTime() > window.start.getTime() ? startOfUtcDay(startDate) : window.start;
  const days = Math.round((window.end.getTime() - clampedStart.getTime()) / DAY_MS);
  return Math.min(window.days, Math.max(0, days));
}

export function computeExpectedHours(input: {
  targetHoursWeekly: number;
  windowDays: number;
  activeDaysInWindow: number;
}): number {
  const windowDays = Math.max(0, finiteOrZero(input.windowDays));
  if (windowDays === 0) return 0;
  const activeDays = Math.min(windowDays, Math.max(0, finiteOrZero(input.activeDaysInWindow)));
  return (finiteOrZero(input.targetHoursWeekly) / 7) * activeDays;
}

// ── Utilization + flags ──────────────────────────────────────────────────

export function computeUtilization(
  expectedHours: number,
  actualHours: number,
): { utilizationPct: number } {
  const expected = Math.max(0, finiteOrZero(expectedHours));
  const utilizationPct = expected > 0 ? (finiteOrZero(actualHours) / expected) * 100 : 0;
  return { utilizationPct };
}

export function computeFlags(
  input: { utilizationPct: number; last14dHours: number; expected14d: number },
  thresholds: CapacityThresholds = DEFAULT_CAPACITY_THRESHOLDS,
): CapacityFlags {
  const utilizationPct = finiteOrZero(input.utilizationPct);
  const last14dHours = finiteOrZero(input.last14dHours);
  const expected14d = finiteOrZero(input.expected14d);

  const overburdened =
    utilizationPct > thresholds.overburdenedPct ||
    (expected14d > 0 && last14dHours > expected14d * thresholds.relativeHoursMultiplier) ||
    last14dHours > thresholds.maxWeeklyHours * 2;

  return {
    overburdened,
    underutilized: !overburdened && utilizationPct < thresholds.underutilizedPct,
  };
}

export function detectTransition(
  prevSeverity: CapacitySeverity | null | undefined,
  input: { utilizationPct: number; last14dHours: number },
  thresholds: CapacityThresholds = DEFAULT_CAPACITY_THRESHOLDS,
): CapacityTransition {
  const prev = prevSeverity ?? "green";
  const utilizationPct = finiteOrZero(input.utilizationPct);

  if (prev === "red" && utilizationPct > thresholds.overburdenedClearPct) {
    return { transition: "none", severity: "red" };
  }
  if (prev === "yellow" && utilizationPct < thresholds.underutilizedClearPct) {
    return { transition: "none", severity: "yellow" };
  }

  const severity = severityForHysteresisEntry(utilizationPct, thresholds);
  if (severity === prev) return { transition: "none", severity };
  if (severity === "green") return { transition: "cleared", severity };
  return { transition: "flagged", severity };
}

function severityForHysteresisEntry(utilizationPct: number, thresholds: CapacityThresholds): CapacitySeverity {
  if (utilizationPct > thresholds.overburdenedPct) return "red";
  if (utilizationPct < thresholds.underutilizedEnterPct) return "yellow";
  return "green";
}

// ── Staleness guard (task 4) ─────────────────────────────────────────────

export function isHoursStale(latestDate: Date | null | undefined, now: Date, maxAgeDays = 2): boolean {
  if (!latestDate) return true;
  return now.getTime() - latestDate.getTime() > maxAgeDays * DAY_MS;
}

// ── Composed per-VA result (tasks 2, 3, 7) ──────────────────────────────

export type CapacityResult = {
  noTarget: boolean;
  expectedHours: number;
  utilizationPct: number;
  overburdened: boolean;
  underutilized: boolean;
  trackingGap: boolean;
};

export function computeCapacity(input: {
  targetHoursWeekly: number | null | undefined;
  taskHrs: number;
  atWorkHrs: number;
  startDate?: Date | null;
  window: CapacityWindow;
  thresholds?: CapacityThresholds;
}): CapacityResult {
  const thresholds = input.thresholds ?? DEFAULT_CAPACITY_THRESHOLDS;
  const target = finiteOrZero(input.targetHoursWeekly ?? undefined);

  if (target <= 0) {
    return {
      noTarget: true,
      expectedHours: 0,
      utilizationPct: 0,
      overburdened: false,
      underutilized: false,
      trackingGap: false,
    };
  }

  const days = activeDaysInWindow(input.window, input.startDate);
  const expectedHours = computeExpectedHours({
    targetHoursWeekly: target,
    windowDays: input.window.days,
    activeDaysInWindow: days,
  });
  const taskHrs = finiteOrZero(input.taskHrs);
  const atWorkHrs = finiteOrZero(input.atWorkHrs);
  const { utilizationPct } = computeUtilization(expectedHours, taskHrs);
  const flags = computeFlags({ utilizationPct, last14dHours: taskHrs, expected14d: expectedHours }, thresholds);

  const gapThreshold = expectedHours * (thresholds.trackingGapPct / 100);
  const trackingGap = !flags.overburdened && atWorkHrs >= gapThreshold && taskHrs < gapThreshold;

  return {
    noTarget: false,
    expectedHours,
    utilizationPct,
    overburdened: flags.overburdened,
    underutilized: flags.underutilized && !trackingGap,
    trackingGap,
  };
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
