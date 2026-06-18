import { db } from "@/lib/db";

export type DelegationAssignee = { id: string; name: string | null; email: string; openTasks: number };

/**
 * Active VAs / Senior-VAs you can delegate to, annotated with their current open-task
 * count and sorted LEAST-burdened first — so whoever's picking an assignee sees who has
 * the most bandwidth at a glance.
 */
export async function getDelegationAssignees(): Promise<DelegationAssignee[]> {
  const [users, counts] = await Promise.all([
    db.user.findMany({
      where: { role: { in: ["VA", "SENIOR_VA"] }, active: true },
      select: { id: true, name: true, email: true },
    }),
    db.task.groupBy({ by: ["assignedToId"], where: { status: { not: "Done" } }, _count: { _all: true } }),
  ]);
  const open = new Map(counts.map((c) => [c.assignedToId, c._count._all]));
  return users
    .map((u) => ({ ...u, openTasks: open.get(u.id) ?? 0 }))
    .sort((a, b) => a.openTasks - b.openTasks || (a.name ?? a.email).localeCompare(b.name ?? b.email));
}
