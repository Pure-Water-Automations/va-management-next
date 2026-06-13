/**
 * AUTO_tierCheck — daily. Scan active non-trainee VAs whose cumulative task-spent
 * hours have reached their next-tier threshold and queue a TierReview for HR.
 * Never auto-promotes (tier_advancement_automatic = FALSE). TRAINEE graduation is
 * evaluation-gated, so trainees are never hours-triggered (computeEligibility).
 */
import type { TierReviewStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { computeEligibility } from "@/lib/services/tier-eligibility";
import { logActivity } from "@/lib/activity";

const OPEN: TierReviewStatus[] = ["hours_triggered", "form_sent", "under_review"];

async function main() {
  const run = await db.syncRun.create({ data: { worker: "tier-check", status: "FAILED" } });
  let queued = 0;
  try {
    const [vas, roles, hours] = await Promise.all([
      db.va.findMany({ where: { status: { in: ["active", "training"] } } }),
      db.compensationRole.findMany(),
      db.deskLogHours.groupBy({ by: ["vaId"], _sum: { taskSpentHrs: true } }),
    ]);
    const roleById = new Map(roles.map((r) => [r.roleId, r]));
    const cumByVa = new Map(hours.map((h) => [h.vaId, h._sum.taskSpentHrs ?? 0]));

    for (const va of vas) {
      const role = roleById.get(va.compensationRole);
      if (!role) continue;
      const cumulative = cumByVa.get(va.vaId) ?? 0;
      const elig = computeEligibility({
        currentRole: va.compensationRole,
        cumulativeHours: cumulative,
        role: {
          minTotalHoursToReachNext: role.minTotalHoursToReachNext ?? undefined,
          nextRoleId: role.nextRoleId ?? undefined,
          onAdvancementTrack: role.onAdvancementTrack,
        },
      });
      if (!elig.eligible || !elig.nextRoleId) continue;

      // Skip if an open review already exists for this VA.
      const existing = await db.tierReview.findFirst({
        where: { vaId: va.vaId, status: { in: OPEN } },
      });
      if (existing) continue;

      await db.tierReview.create({
        data: {
          vaId: va.vaId,
          vaName: va.name,
          currentRole: va.compensationRole,
          targetRole: elig.nextRoleId as never,
          cumulativeHoursAtTrigger: cumulative,
          status: "hours_triggered",
        },
      });
      await logActivity({
        source: "tier_check",
        eventType: "tier_queued",
        vaId: va.vaId,
        summary: `${va.name} reached ${Math.round(cumulative)}h → queued for ${elig.nextRoleId} review`,
      });
      queued++;
    }

    await db.syncRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", finishedAt: new Date(), detailsJson: { queued } },
    });
    console.log(`tier-check: queued ${queued} review(s)`);
  } catch (err) {
    await db.syncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), firstErrorLine: String(err).split("\n")[0] },
    });
    throw err;
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`tier-check failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
