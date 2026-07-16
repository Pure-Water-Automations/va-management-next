import { db } from "@/lib/db";
import { capacityWindow, computeCapacity, resolveCapacityThresholds } from "@/lib/services/capacity";
import { activeHoursSource } from "@/lib/services/hours-source";
import { computeEligibility } from "@/lib/services/tier-eligibility";
import { baselineCutover, deskLogSinceCutover, withBaseline } from "@/lib/services/cumulative";
import { loadSettings } from "@/lib/settings";

const DAY = 24 * 60 * 60 * 1000;

// Rolling "task hours" = DeskLog task_spent_time — the intended productivity metric
// (same field payroll + tier use). HR views show it next to actual time-at-work so a
// clocked-in-but-not-logging gap is visible; payroll/tier stay on task hours.
async function sumHours(vaId: string, daysBack?: number): Promise<number> {
  const where = daysBack
    ? { vaId, date: { gte: new Date(Date.now() - daysBack * DAY) } }
    : { vaId };
  const r = await db.deskLogHours.aggregate({ where, _sum: { taskSpentHrs: true } });
  return r._sum.taskSpentHrs ?? 0;
}

export type VaDashboard = Awaited<ReturnType<typeof getVaDashboard>>;

/** Privacy-scoped: only the signed-in VA's own data. */
export async function getVaDashboard(vaId: string) {
  const va = await db.va.findUnique({ where: { vaId } });
  if (!va) throw new Error(`VA not found: ${vaId}`);

  const role = await db.compensationRole.findUnique({ where: { roleId: va.compensationRole } });
  const cutover = await baselineCutover();
  const window = capacityWindow(new Date());

  const [last7, capacityHours, deskLogCum, myReviews, myActivity, openPeriod, deskLogSyncedThrough, settings] = await Promise.all([
    sumHours(vaId, 7),
    activeHoursSource().capacityHoursByVa(window.start, window.end, [vaId]),
    db.deskLogHours.aggregate({ where: { vaId, ...deskLogSinceCutover(cutover) }, _sum: { taskSpentHrs: true } }).then((r) => r._sum.taskSpentHrs ?? 0),
    db.tierReview.findMany({ where: { vaId }, orderBy: { timestamp: "desc" }, take: 3 }),
    db.activityLog.findMany({ where: { vaId }, orderBy: { timestamp: "desc" }, take: 10 }),
    db.payrollPeriod.findFirst({ where: { status: "open" }, orderBy: { periodStart: "desc" } }),
    // Newest DeskLog date across all VAs = how fresh the hours feed is. A stale value means the
    // ingest is behind, so a 0% utilization is "data not synced" rather than "did no work".
    db.deskLogHours.aggregate({ _max: { date: true } }).then((r) => r._max.date),
    loadSettings(),
  ]);
  const cumulative = withBaseline(va.baselineHours, deskLogCum);

  const h = capacityHours[vaId] ?? { taskHrs: 0, atWorkHrs: 0 };
  const last14 = h.taskHrs;
  const capacity = computeCapacity({
    targetHoursWeekly: va.targetHoursWeekly,
    taskHrs: h.taskHrs,
    atWorkHrs: h.atWorkHrs,
    startDate: va.startDate,
    window,
    thresholds: resolveCapacityThresholds(settings),
  });
  const { utilizationPct } = capacity;
  const flags = { overburdened: capacity.overburdened, underutilized: capacity.underutilized };
  const eligibility = role
    ? computeEligibility({
        currentRole: va.compensationRole,
        cumulativeHours: cumulative,
        role: {
          minTotalHoursToReachNext: role.minTotalHoursToReachNext ?? undefined,
          nextRoleId: role.nextRoleId ?? undefined,
          onAdvancementTrack: role.onAdvancementTrack,
        },
      })
    : { eligible: false };

  const hoursToNext =
    role?.minTotalHoursToReachNext != null
      ? Math.max(0, role.minTotalHoursToReachNext - cumulative)
      : null;

  const checkinDue = !va.lastCheckinDate || Date.now() - va.lastCheckinDate.getTime() > 30 * DAY;

  return {
    va,
    role,
    last7,
    last14,
    cumulative,
    utilizationPct,
    flags,
    noTarget: capacity.noTarget,
    trackingGap: capacity.trackingGap,
    eligibility,
    hoursToNext,
    myReviews,
    myActivity,
    openPeriod,
    checkinDue,
    deskLogSyncedThrough,
  };
}
