import { db } from "@/lib/db";
import { capacityWindow, computeCapacity, resolveCapacityThresholds } from "@/lib/services/capacity";
import { activeHoursSource } from "@/lib/services/hours-source";
import { estHourNow, isAvailableNow } from "@/lib/services/availability";
import { loadSettings } from "@/lib/settings";

const DAY = 24 * 60 * 60 * 1000;

export async function getCapacity() {
  const window = capacityWindow(new Date());
  const source = activeHoursSource();
  const [vas, hours, assignedHrs, events, settings] = await Promise.all([
    db.va.findMany({ where: { status: { in: ["active", "training"] } }, orderBy: { name: "asc" } }),
    source.capacityHoursByVa(window.start, window.end),
    source.assignedHoursByVa(window.start, window.end),
    db.capacityFlagEvent.findMany({ orderBy: { timestamp: "desc" }, take: 30 }),
    loadSettings(),
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
    // Demand-side signal only (task 8) — assigned vs tracked vs target, not flagged on.
    const demandVsSupply = {
      assignedHrs: assignedHrs[va.vaId] ?? 0,
      trackedHrs: h.taskHrs,
      targetHrs: capacity.expectedHours,
    };
    return { va, last14dHours: h.taskHrs, atWork14dHours: h.atWorkHrs, demandVsSupply, ...capacity };
  });

  const flagged = withCapacity.filter((r) => r.overburdened || r.underutilized || r.trackingGap);
  const noTarget = withCapacity.filter((r) => r.noTarget);
  return { flagged, events, noTarget };
}

/** Who reported being typically available right now (EST), for urgent/rush coverage. */
export async function getAvailability() {
  const vas = await db.va.findMany({
    where: { status: { in: ["active", "training"] } },
    orderBy: { name: "asc" },
    select: {
      vaId: true,
      name: true,
      email: true,
      supervisorVaId: true,
      availabilityStartHourEst: true,
      availabilityEndHourEst: true,
      availabilityNotes: true,
    },
  });
  const currentHour = estHourNow(new Date());
  const withAvailability = vas.map((va) => ({
    va,
    hasWindow: va.availabilityStartHourEst != null && va.availabilityEndHourEst != null,
    availableNow: isAvailableNow(va.availabilityStartHourEst, va.availabilityEndHourEst, currentHour),
  }));
  return {
    currentHour,
    availableNow: withAvailability.filter((r) => r.availableNow),
    noWindowSet: withAvailability.filter((r) => !r.hasWindow),
    all: withAvailability,
  };
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
