// Pace-based target math shared by the leadership screens (server reads +
// client live edits). Pure — safe to import from both sides.

import { compactMoney } from "@/lib/sales/packages";

export type PaceStatus = "Hit" | "On track" | "Behind";

/** Day-of-month progress: "July 2026 · day 7 of 31" and elapsed = 7/31. */
export function monthInfo(now: Date = new Date()) {
  const day = now.getDate();
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthName = now.toLocaleString("en-US", { month: "long" });
  const monthShort = now.toLocaleString("en-US", { month: "short" });
  return {
    day,
    days,
    elapsed: day / days,
    monthName,
    monthShort,
    label: `${monthName} ${now.getFullYear()} · day ${day} of ${days}`,
  };
}

/** "Q3 2026" for the Goals header. */
export function quarterLabel(now: Date = new Date()): string {
  return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
}

/**
 * The design's pace rule: pct >= 1 → Hit; pct >= elapsed*0.9 → On track;
 * else Behind (elapsed = dayOfMonth / daysInMonth).
 */
export function paceStatus(actual: number, target: number, elapsed: number): PaceStatus {
  const pct = target > 0 ? actual / target : 0;
  if (pct >= 1) return "Hit";
  if (pct >= elapsed * 0.9) return "On track";
  return "Behind";
}

/** "$9.4k" for money targets, "3" for counts. */
export function fmtTargetValue(n: number, unit: string): string {
  return unit === "$" ? compactMoney(n) : String(Math.round(n));
}
