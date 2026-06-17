import { db } from "@/lib/db";
import { computeUtilization, computeFlags } from "@/lib/services/capacity";

const DAY = 24 * 60 * 60 * 1000;

export async function getCapacity() {
  const [vas, hours, events] = await Promise.all([
    db.va.findMany({ where: { status: { in: ["active", "training"] } }, orderBy: { name: "asc" } }),
    db.deskLogHours.groupBy({
      by: ["vaId"],
      where: { date: { gte: new Date(Date.now() - 14 * DAY) } },
      _sum: { taskSpentHrs: true },
    }),
    db.capacityFlagEvent.findMany({ orderBy: { timestamp: "desc" }, take: 30 }),
  ]);
  const last14 = new Map(hours.map((h) => [h.vaId, h._sum.taskSpentHrs ?? 0]));
  const flagged = vas
    .map((va) => {
      const last = last14.get(va.vaId) ?? 0;
      const { utilizationPct } = computeUtilization(va.targetHoursWeekly ?? 0, last);
      const f = computeFlags(va.targetHoursWeekly ?? 0, last);
      return { va, last14dHours: last, utilizationPct, ...f };
    })
    .filter((r) => r.overburdened || r.underutilized);
  return { flagged, events };
}

export async function getCheckins() {
  const vas = await db.va.findMany({
    where: { status: { in: ["active", "training"] } },
    orderBy: { name: "asc" },
  });
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  return vas.map((va) => {
    const ageDays = va.lastCheckinDate
      ? Math.floor((Date.now() - va.lastCheckinDate.getTime()) / DAY)
      : null;
    const thisMonth = !!va.lastCheckinDate && va.lastCheckinDate >= monthStart;
    return { va, ageDays, thisMonth };
  });
}

const GATE_INCLUDE = {
  sessions: { orderBy: { createdAt: "desc" } },
  taskProgress: { include: { assignment: { select: { task: true, skill: true, sortOrder: true } } } },
} as const;

/** Post-trial gate queue: candidates doing / finished the 10-hour trial. */
export async function getGateQueue() {
  return db.candidate.findMany({
    where: { currentStage: "tenhr_in_progress" },
    include: GATE_INCLUDE,
    orderBy: { trainingTotalMinutes: "desc" },
  });
}

/** Pre-trial gate queue: recruiter-recommended candidates awaiting the onboarding-readiness review. */
export async function getPreTrialQueue() {
  return db.candidate.findMany({
    where: { currentStage: "tenhr_invited" },
    include: GATE_INCLUDE,
    orderBy: { decidedAt: "desc" },
  });
}

export async function getOnboarding() {
  return db.onboarding.findMany({
    where: { status: { not: "completed" } },
    include: { va: true },
    orderBy: { signedAt: "asc" },
  });
}
