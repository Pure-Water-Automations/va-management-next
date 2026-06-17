import { db } from "@/lib/db";
import { loadSettings, num } from "@/lib/settings";
import { computeUtilization, computeFlags } from "@/lib/services/capacity";

const DAY = 24 * 60 * 60 * 1000;

/** Sum taskSpentHrs per VA over a window (days back from now), or all-time if days omitted. */
async function hoursByVa(daysBack?: number): Promise<Map<string, number>> {
  const where = daysBack
    ? { date: { gte: new Date(Date.now() - daysBack * DAY) } }
    : undefined;
  const rows = await db.deskLogHours.groupBy({
    by: ["vaId"],
    where,
    _sum: { taskSpentHrs: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.vaId, r._sum.taskSpentHrs ?? 0);
  return m;
}

export type HrDashboard = Awaited<ReturnType<typeof getHrDashboard>>;

export async function getHrDashboard() {
  const settings = await loadSettings();
  const effWindow = num(settings, "efficiency_window_days", 7);
  const redT = num(settings, "efficiency_red_threshold", 15);
  const yellowT = num(settings, "efficiency_yellow_threshold", 25);

  const [vas, pendingReviews, recentActivity, last14d, effRows] = await Promise.all([
    db.va.findMany({
      where: { status: { in: ["active", "training"] } },
      orderBy: { name: "asc" },
    }),
    db.tierReview.findMany({
      where: { status: { in: ["hours_triggered", "form_sent", "under_review"] } },
      orderBy: { timestamp: "asc" },
    }),
    db.activityLog.findMany({ orderBy: { timestamp: "desc" }, take: 20 }),
    hoursByVa(14),
    db.deskLogEfficiency.findMany({
      where: { date: { gte: new Date(Date.now() - effWindow * DAY) } },
      select: { vaId: true, activityPct: true },
    }),
  ]);

  // Capacity flags from utilization vs target.
  const capacityFlags = vas
    .map((va) => {
      const last = last14d.get(va.vaId) ?? 0;
      const target = va.targetHoursWeekly ?? 0;
      const { utilizationPct } = computeUtilization(target, last);
      const flags = computeFlags(target, last);
      return { va, last14dHours: last, utilizationPct, ...flags };
    })
    .filter((r) => r.overburdened || r.underutilized);

  // Efficiency averages per VA over the window (exclude team leads w/ reports).
  const effByVa = new Map<string, { sum: number; n: number }>();
  for (const e of effRows) {
    if (e.activityPct == null) continue;
    const cur = effByVa.get(e.vaId) ?? { sum: 0, n: 0 };
    cur.sum += e.activityPct;
    cur.n += 1;
    effByVa.set(e.vaId, cur);
  }
  const leadIds = new Set(
    vas.filter((v) => vas.some((o) => o.supervisorVaId === v.vaId)).map((v) => v.vaId),
  );
  const efficiencyAlerts = vas
    .filter((v) => !leadIds.has(v.vaId) && effByVa.has(v.vaId))
    .map((v) => {
      const { sum, n } = effByVa.get(v.vaId)!;
      const avg = n ? sum / n : 0;
      const flag = avg < redT ? "RED" : avg < yellowT ? "YELLOW" : "GREEN";
      return { va: v, avgActivity: avg, flag };
    })
    .filter((r) => r.flag !== "GREEN");

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const checkinsThisMonth = vas.filter(
    (v) => v.lastCheckinDate && v.lastCheckinDate >= monthStart,
  ).length;

  return {
    totalActive: vas.length,
    pendingReviews: pendingReviews.map((r) => ({
      ...r,
      daysWaiting: Math.floor((Date.now() - r.timestamp.getTime()) / DAY),
    })),
    capacityFlags,
    efficiencyAlerts,
    checkinsThisMonth,
    recentActivity,
  };
}
