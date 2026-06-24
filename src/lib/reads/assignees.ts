import { db } from "@/lib/db";

export type DelegationAssignee = { id: string; name: string | null; email: string; openTasks: number; onClient: boolean };

/**
 * Active VAs / Senior-VAs you can delegate to, annotated with their current open-task
 * count and sorted LEAST-burdened first — so whoever's picking an assignee sees who has
 * the most bandwidth at a glance. When a `clientOrganizationId` is given, VAs explicitly
 * assigned to that client (ClientAssignment) are flagged `onClient` and floated to the
 * top — auto-suggesting the people who already work that account.
 */
export async function getDelegationAssignees(clientOrganizationId?: string | null): Promise<DelegationAssignee[]> {
  const [users, counts, assigned] = await Promise.all([
    db.user.findMany({
      where: { role: { in: ["VA", "SENIOR_VA"] }, active: true },
      select: { id: true, name: true, email: true },
    }),
    db.task.groupBy({ by: ["assignedToId"], where: { status: { not: "Done" }, claimable: false }, _count: { _all: true } }),
    clientOrganizationId
      ? db.clientAssignment.findMany({ where: { clientOrganizationId }, select: { userId: true } })
      : Promise.resolve([] as { userId: string }[]),
  ]);
  const open = new Map(counts.map((c) => [c.assignedToId, c._count._all]));
  const onClientSet = new Set(assigned.map((a) => a.userId));
  return users
    .map((u) => ({ ...u, openTasks: open.get(u.id) ?? 0, onClient: onClientSet.has(u.id) }))
    .sort(
      (a, b) =>
        Number(b.onClient) - Number(a.onClient) || // assigned to this client first
        a.openTasks - b.openTasks ||
        (a.name ?? a.email).localeCompare(b.name ?? b.email),
    );
}
