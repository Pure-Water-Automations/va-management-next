import { db } from "@/lib/db";
import type { ClientTeamRole, Role } from "@prisma/client";

export type ClientTeamMember = {
  userId: string;
  name: string | null;
  email: string;
  staffRole: Role;
  role: ClientTeamRole;
  vaId: string | null;
};

/** Staff assigned to a client (LEAD first, then by assignment order). */
export async function getClientTeam(clientOrganizationId: string): Promise<ClientTeamMember[]> {
  const rows = await db.clientAssignment.findMany({
    where: { clientOrganizationId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }], // enum order: LEAD before MEMBER
    select: { userId: true, role: true, user: { select: { name: true, email: true, role: true, vaId: true } } },
  });
  return rows.map((r) => ({
    userId: r.userId,
    name: r.user.name,
    email: r.user.email,
    staffRole: r.user.role,
    role: r.role,
    vaId: r.user.vaId,
  }));
}

/**
 * Active internal staff who can be assigned to a client. Delivery roles are
 * assignable; admins (isAdmin) are also included regardless of role so oversight
 * accounts (e.g. a RECRUITER admin) can sit on a client team and exercise the
 * "My Clients" views.
 */
export async function getAssignableStaff(): Promise<{ id: string; name: string | null; email: string; role: Role }[]> {
  return db.user.findMany({
    where: {
      active: true,
      OR: [
        { role: { in: ["VA", "HR_MANAGER", "PEOPLE_OPS"] } },
        { isAdmin: true },
      ],
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: [{ name: "asc" }],
  });
}

/** Client-org ids the given user is assigned to (for "my clients" filtering). */
export async function getMyClientIds(userId: string): Promise<Set<string>> {
  const rows = await db.clientAssignment.findMany({ where: { userId }, select: { clientOrganizationId: true } });
  return new Set(rows.map((r) => r.clientOrganizationId));
}
