import { db } from "@/lib/db";

/** Log one authenticated page render. Never throws — a logging blip must not break the page. */
export async function logPageView(input: {
  path: string;
  userId?: string | null;
  vaId?: string | null;
  role?: string | null;
  view?: string | null;
}): Promise<void> {
  try {
    await db.pageView.create({
      data: {
        path: input.path,
        userId: input.userId ?? null,
        vaId: input.vaId ?? null,
        role: input.role ?? null,
        view: input.view ?? null,
      },
    });
  } catch {
    // best-effort telemetry, swallow
  }
}

export async function getUsageSummary(sinceDays: number) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const [topPaths, byRole, byUser, byUserPath, dailyActive, total] = await Promise.all([
    db.pageView.groupBy({
      by: ["path"],
      where: { timestamp: { gte: since } },
      _count: { path: true },
      orderBy: { _count: { path: "desc" } },
      take: 20,
    }),
    db.pageView.groupBy({
      by: ["role"],
      where: { timestamp: { gte: since } },
      _count: { role: true },
      orderBy: { _count: { role: "desc" } },
    }),
    db.pageView.groupBy({
      by: ["userId"],
      where: { timestamp: { gte: since }, userId: { not: null } },
      _count: { userId: true },
      orderBy: { _count: { userId: "desc" } },
      take: 20,
    }),
    db.pageView.groupBy({
      by: ["userId", "path"],
      where: { timestamp: { gte: since }, userId: { not: null } },
      _count: { _all: true },
      _max: { timestamp: true },
      orderBy: { _count: { userId: "desc" } },
      take: 60,
    }),
    db.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "timestamp") AS day, COUNT(*)::bigint AS count
      FROM "PageView"
      WHERE "timestamp" >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `,
    db.pageView.count({ where: { timestamp: { gte: since } } }),
  ]);

  const userIds = [...new Set([...byUser, ...byUserPath].map((u) => u.userId))].filter(
    (id): id is string => !!id,
  );
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u.name ?? u.email]));

  return {
    total,
    topPaths: topPaths.map((p) => ({ path: p.path, count: p._count.path })),
    byRole: byRole.map((r) => ({ role: r.role ?? "unknown", count: r._count.role })),
    byUser: byUser.map((u) => ({
      userId: u.userId!,
      name: userMap.get(u.userId!) ?? u.userId,
      count: u._count.userId,
    })),
    byUserPath: byUserPath.map((r) => ({
      name: userMap.get(r.userId!) ?? r.userId!,
      path: r.path,
      count: r._count._all,
      lastVisit: r._max.timestamp,
    })),
    dailyActive: dailyActive.map((d) => ({ day: d.day, count: Number(d.count) })),
  };
}
