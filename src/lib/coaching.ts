import { db } from "@/lib/db";

const HR_ROLES = ["HR_MANAGER", "PEOPLE_OPS"];
const CAPACITY_PATH = "/hr/capacity";
const HOUR = 60 * 60 * 1000;

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Capacity-flag coaching report: are managers acting on the signals the console raises?
 *
 * Joins three existing streams — CapacityFlagEvent (flags raised/resolved), PageView
 * (who opened /hr/capacity, when), and the manual-review events — to measure how fast
 * HR responds to a flag and which flags nobody ever looked at.
 *
 * The "viewed" signal is a proxy: /hr/capacity lists ALL current flags, so any HR visit
 * after a flag was raised counts as "seen" — we can't attribute a view to one specific flag.
 */
export async function getCapacityCoaching(sinceDays: number) {
  const since = new Date(Date.now() - sinceDays * 24 * HOUR);
  const weeks = Math.max(sinceDays / 7, 1);

  const [flaggedRaw, resolutions, hrViews, hrEngagement] = await Promise.all([
    db.capacityFlagEvent.findMany({
      where: { timestamp: { gte: since }, transition: "flagged" },
      orderBy: { timestamp: "asc" },
      select: { id: true, vaId: true, vaName: true, flagType: true, severity: true, timestamp: true },
    }),
    db.capacityFlagEvent.findMany({
      where: { timestamp: { gte: since }, transition: { in: ["cleared", "reviewed"] } },
      orderBy: { timestamp: "asc" },
      select: { vaId: true, transition: true, timestamp: true },
    }),
    db.pageView.findMany({
      where: { timestamp: { gte: since }, path: CAPACITY_PATH, role: { in: HR_ROLES } },
      orderBy: { timestamp: "asc" },
      select: { timestamp: true },
    }),
    db.pageView.groupBy({
      by: ["userId"],
      where: { timestamp: { gte: since }, path: CAPACITY_PATH, role: { in: HR_ROLES }, userId: { not: null } },
      _count: { _all: true },
      _max: { timestamp: true },
      orderBy: { _count: { userId: "desc" } },
    }),
  ]);

  const viewTimes = hrViews.map((v) => v.timestamp.getTime());
  const now = Date.now();

  const flags = flaggedRaw.map((f) => {
    const t = f.timestamp.getTime();
    const resolution = resolutions.find((r) => r.vaId === f.vaId && r.timestamp.getTime() > t);
    const firstViewMs = viewTimes.find((v) => v >= t) ?? null;
    return {
      vaName: f.vaName ?? f.vaId,
      flagType: f.flagType,
      severity: f.severity,
      raisedAt: f.timestamp,
      resolvedAt: resolution?.timestamp ?? null,
      resolvedBy: resolution?.transition ?? null, // "cleared" (auto) | "reviewed" (manual HR)
      hoursToView: firstViewMs != null ? (firstViewMs - t) / HOUR : null,
      hoursToResolve: resolution ? (resolution.timestamp.getTime() - t) / HOUR : null,
      openHours: resolution ? null : (now - t) / HOUR,
      viewedBeforeResolve:
        firstViewMs != null && (!resolution || firstViewMs <= resolution.timestamp.getTime()),
    };
  });

  const open = flags.filter((f) => !f.resolvedAt);
  const neverViewed = flags.filter((f) => f.hoursToView == null);

  // Resolve names for the per-HR engagement rows.
  const ids = hrEngagement.map((r) => r.userId).filter((id): id is string => !!id);
  const users = ids.length
    ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email]));

  return {
    sinceDays,
    stats: {
      raised: flags.length,
      resolved: flags.length - open.length,
      open: open.length,
      neverViewed: neverViewed.length,
      manuallyReviewed: flags.filter((f) => f.resolvedBy === "reviewed").length,
      medianHoursToView: median(flags.map((f) => f.hoursToView).filter((h): h is number => h != null)),
      medianHoursToResolve: median(flags.map((f) => f.hoursToResolve).filter((h): h is number => h != null)),
      oldestOpenHours: open.length ? Math.max(...open.map((f) => f.openHours!)) : null,
    },
    hrEngagement: hrEngagement.map((r) => ({
      name: nameOf.get(r.userId!) ?? r.userId!,
      visits: r._count._all,
      visitsPerWeek: r._count._all / weeks,
      lastVisit: r._max.timestamp,
      daysSinceLastVisit: r._max.timestamp ? (now - r._max.timestamp.getTime()) / (24 * HOUR) : null,
    })),
    // Attention list: open flags oldest-first, then never-viewed.
    attention: [...open]
      .sort((a, b) => (b.openHours ?? 0) - (a.openHours ?? 0))
      .slice(0, 25),
  };
}
