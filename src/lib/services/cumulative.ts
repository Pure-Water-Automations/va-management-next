import { db } from "@/lib/db";

/**
 * Cumulative VA hours = a per-VA baseline carried over from the old tool, plus
 * DeskLog hours logged on/after a global cutover date. This lets the new tool
 * continue cumulative totals from where the old one left off without
 * double-counting any DeskLog history.
 *
 * Setting `cumulative_baseline_date` (YYYY-MM-DD) is the cutover. When unset,
 * all DeskLog hours are counted (baseline simply adds on top).
 */
export async function baselineCutover(): Promise<Date | null> {
  const row = await db.setting.findUnique({ where: { key: "cumulative_baseline_date" }, select: { value: true } });
  const v = (row?.value || "").trim();
  if (!v) return null;
  const d = new Date(v.length === 10 ? `${v}T00:00:00.000Z` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Prisma `where` fragment limiting DeskLog rows to on/after the cutover. */
export function deskLogSinceCutover(cutover: Date | null): Record<string, unknown> {
  return cutover ? { date: { gte: cutover } } : {};
}

export function withBaseline(baselineHours: number | null | undefined, deskLogHours: number): number {
  return (baselineHours ?? 0) + deskLogHours;
}
