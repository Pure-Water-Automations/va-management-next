import { db } from "@/lib/db";
import { computeEligibility } from "@/lib/services/tier-eligibility";

const DAY = 24 * 60 * 60 * 1000;

export async function getRegistry() {
  const [vas, roles, hours] = await Promise.all([
    db.va.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] }),
    db.compensationRole.findMany(),
    db.deskLogHours.groupBy({ by: ["vaId"], _sum: { taskSpentHrs: true } }),
  ]);
  const roleById = new Map(roles.map((r) => [r.roleId, r]));
  const cumByVa = new Map(hours.map((h) => [h.vaId, h._sum.taskSpentHrs ?? 0]));

  return vas.map((va) => {
    const role = roleById.get(va.compensationRole);
    const cumulative = cumByVa.get(va.vaId) ?? 0;
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
    const checkinAge = va.lastCheckinDate
      ? Math.floor((Date.now() - va.lastCheckinDate.getTime()) / DAY)
      : null;
    return { va, cumulative, eligibility, checkinAge };
  });
}

export function getRoles() {
  return db.compensationRole.findMany({ orderBy: { roleId: "asc" } });
}

export function getReviewQueue() {
  return db.tierReview.findMany({ orderBy: { timestamp: "desc" } });
}
