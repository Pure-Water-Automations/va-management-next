import { db } from "@/lib/db";
import { computeUtilization, computeFlags } from "@/lib/services/capacity";
import { computeEligibility } from "@/lib/services/tier-eligibility";
import { baselineCutover, deskLogSinceCutover, withBaseline } from "@/lib/services/cumulative";

const DAY = 24 * 60 * 60 * 1000;

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

  const [last7, last14, deskLogCum, myReviews, myActivity, openPeriod] = await Promise.all([
    sumHours(vaId, 7),
    sumHours(vaId, 14),
    db.deskLogHours.aggregate({ where: { vaId, ...deskLogSinceCutover(cutover) }, _sum: { taskSpentHrs: true } }).then((r) => r._sum.taskSpentHrs ?? 0),
    db.tierReview.findMany({ where: { vaId }, orderBy: { timestamp: "desc" }, take: 3 }),
    db.activityLog.findMany({ where: { vaId }, orderBy: { timestamp: "desc" }, take: 10 }),
    db.payrollPeriod.findFirst({ where: { status: "open" }, orderBy: { periodStart: "desc" } }),
  ]);
  const cumulative = withBaseline(va.baselineHours, deskLogCum);

  const target = va.targetHoursWeekly ?? 0;
  const { utilizationPct } = computeUtilization(target, last14);
  const flags = computeFlags(target, last14);
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
    eligibility,
    hoursToNext,
    myReviews,
    myActivity,
    openPeriod,
    checkinDue,
  };
}
