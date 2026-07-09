// The ONE seam between payroll and whatever time tracker is in use.
// DeskLog today; the in-house tracker later — swap by adding an adapter and
// changing activeHoursSource(). Payroll code must not query DeskLog tables
// directly (proposal review flag #1).

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
    const { db } = await import("@/lib/db");
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
    const { db } = await import("@/lib/db");
    const grouped = await db.deskLogHours.groupBy({
      by: ["vaId"],
      where: { vaId: { in: vaIds }, date: { lt: before } },
      _sum: { taskSpentHrs: true },
    });
    return Object.fromEntries(grouped.map((g) => [g.vaId, g._sum.taskSpentHrs ?? 0]));
  }

  async breakdown(periodStart: Date, periodEnd: Date, vaIds?: string[]) {
    const { db } = await import("@/lib/db");
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
