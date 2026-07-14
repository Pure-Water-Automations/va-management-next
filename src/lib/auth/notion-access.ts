import type { CurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";

/**
 * Who may connect/manage a client org's Notion sync:
 *  - Staff who manage clients: HR_MANAGER, PEOPLE_OPS, all-access (admin/Tester).
 *  - The client themselves: a CLIENT_ADMIN whose membership is that org.
 * (Beta: the staff-side UI is additionally founder-gated via isBetaVisible; the
 * client portal shows it to that org's CLIENT_ADMIN.)
 */
export async function canManageNotionForOrg(user: CurrentUser, clientOrganizationId: string): Promise<boolean> {
  if (user.isAdmin || user.role === "TESTER") return true;
  if (user.role === "HR_MANAGER" || user.role === "PEOPLE_OPS") return true;
  if (user.role === "CLIENT_ADMIN") {
    const membership = await db.clientMembership.findFirst({
      where: { userId: user.id, clientOrganizationId },
      select: { id: true },
    });
    return !!membership;
  }
  return false;
}

/** Resolve a client org by id or slug from a request body. */
export async function resolveOrg(body: Record<string, unknown>): Promise<{ id: string; name: string } | null> {
  const id = typeof body.orgId === "string" ? body.orgId : undefined;
  const slug = typeof body.orgSlug === "string" ? body.orgSlug : undefined;
  if (id) return db.clientOrganization.findUnique({ where: { id }, select: { id: true, name: true } });
  if (slug) return db.clientOrganization.findUnique({ where: { slug }, select: { id: true, name: true } });
  return null;
}
