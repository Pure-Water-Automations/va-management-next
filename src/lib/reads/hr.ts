import { db } from "@/lib/db";
import { loadSettings, num } from "@/lib/settings";
import { capacityWindow, computeCapacity, resolveCapacityThresholds } from "@/lib/services/capacity";
import { activeHoursSource } from "@/lib/services/hours-source";

const DAY = 24 * 60 * 60 * 1000;

export type HrDashboard = Awaited<ReturnType<typeof getHrDashboard>>;

export async function getHrDashboard() {
  const settings = await loadSettings();
  const effWindow = num(settings, "efficiency_window_days", 7);
  const redT = num(settings, "efficiency_red_threshold", 15);
  const yellowT = num(settings, "efficiency_yellow_threshold", 25);

  const window = capacityWindow(new Date());
  const [vas, pendingReviews, recentActivity, hours, effRows, openEvaluations, incomingRequests] =
    await Promise.all([
      db.va.findMany({
        where: { status: { in: ["active", "training"] } },
        orderBy: { name: "asc" },
      }),
      db.tierReview.findMany({
        where: { status: { in: ["hours_triggered", "form_sent", "under_review"] } },
        orderBy: { timestamp: "asc" },
      }),
      db.activityLog.findMany({ orderBy: { timestamp: "desc" }, take: 20 }),
      activeHoursSource().capacityHoursByVa(window.start, window.end),
      db.deskLogEfficiency.findMany({
        where: { date: { gte: new Date(Date.now() - effWindow * DAY) } },
        select: { vaId: true, activityPct: true },
      }),
      db.evaluation.findMany({
        where: { status: { in: ["self_submitted", "supervisor_submitted", "ready_for_review"] } },
        orderBy: { createdAt: "asc" },
        select: { evaluationId: true, vaId: true, status: true, createdAt: true, va: { select: { name: true } } },
      }),
      db.clientTaskRequest.findMany({
        where: { status: { in: ["RECEIVED", "TRIAGE_NEEDED", "READY_TO_ASSIGN"] } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          createdAt: true,
          priorityPreference: true,
          clientOrganization: { select: { name: true } },
        },
      }),
    ]);
  const thresholds = resolveCapacityThresholds(settings);

  const withCapacity = vas.map((va) => {
    const h = hours[va.vaId] ?? { taskHrs: 0, atWorkHrs: 0 };
    const capacity = computeCapacity({
      targetHoursWeekly: va.targetHoursWeekly,
      taskHrs: h.taskHrs,
      atWorkHrs: h.atWorkHrs,
      startDate: va.startDate,
      window,
      thresholds,
    });
    return { va, last14dHours: h.taskHrs, atWork14dHours: h.atWorkHrs, ...capacity };
  });

  // Capacity flags from utilization vs target (VAs with no target are a data-quality gap, not a flag).
  const capacityFlags = withCapacity.filter((r) => r.overburdened || r.underutilized || r.trackingGap);
  const noTargetVas = withCapacity.filter((r) => r.noTarget).map((r) => r.va);

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

  // Per-VA workload (utilization) for the dashboard glance + team-health rollup.
  const workload = withCapacity
    .map((r) => ({
      vaId: r.va.vaId,
      name: r.va.name,
      role: r.va.compensationRole,
      target: r.va.targetHoursWeekly ?? 0,
      last14dHours: r.last14dHours,
      atWork14dHours: r.atWork14dHours,
      utilizationPct: r.utilizationPct,
      overburdened: r.overburdened,
      underutilized: r.underutilized,
      trackingGap: r.trackingGap,
      noTarget: r.noTarget,
    }))
    .sort((a, b) => b.utilizationPct - a.utilizationPct);

  const health = {
    healthy: workload.filter((w) => !w.overburdened && !w.underutilized && !w.trackingGap).length,
    overloaded: workload.filter((w) => w.overburdened).length,
    underused: workload.filter((w) => w.underutilized).length,
    trackingGap: workload.filter((w) => w.trackingGap).length,
  };

  const pending = pendingReviews.map((r) => ({
    ...r,
    daysWaiting: Math.floor((Date.now() - r.timestamp.getTime()) / DAY),
  }));

  return {
    totalActive: vas.length,
    pendingReviews: pending,
    capacityFlags,
    noTargetVas,
    efficiencyAlerts,
    checkinsThisMonth,
    recentActivity,
    workload,
    health,
    openEvaluations,
    incomingRequests,
    // Aggregate count of things that genuinely need an HR decision today.
    decisionCount:
      pending.length + capacityFlags.length + openEvaluations.length + incomingRequests.length,
  };
}
