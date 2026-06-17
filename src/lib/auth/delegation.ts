import { db } from "@/lib/db";
import type { Role } from "@prisma/client";

/**
 * Tier-aware delegation authority (card #22). HR Manager / People-Ops / Team-Lead
 * always delegate. A VA / Senior-VA delegates only if their comp tier's
 * configurable flag is on (admin sets these on the Compensation Roles screen;
 * default Tier 3 "Senior VA" + Tier 4 "Lead").
 */

const MANAGER_ROLES = new Set<Role>(["HR_MANAGER", "PEOPLE_OPS", "TEAM_LEAD"]);

async function tierFlags(actorId: string) {
  const u = await db.user.findUnique({ where: { id: actorId }, include: { va: true } });
  if (!u?.va) return { tier: null as string | null, canDelegateTasks: false, canDelegateProjects: false };
  const cr = await db.compensationRole.findUnique({
    where: { roleId: u.va.compensationRole },
    select: { canDelegateTasks: true, canDelegateProjects: true },
  });
  return {
    tier: u.va.compensationRole as string,
    canDelegateTasks: cr?.canDelegateTasks ?? false,
    canDelegateProjects: cr?.canDelegateProjects ?? false,
  };
}

export async function canUserDelegateTasks(actorId: string, role: Role): Promise<boolean> {
  if (MANAGER_ROLES.has(role)) return true;
  return (await tierFlags(actorId)).canDelegateTasks;
}

export async function canUserDelegateProjects(actorId: string, role: Role): Promise<boolean> {
  if (MANAGER_ROLES.has(role)) return true;
  return (await tierFlags(actorId)).canDelegateProjects;
}

/** The actor's comp tier (TRAINEE..TIER_4) or null if they're not a VA. */
export async function getActorTier(actorId: string): Promise<string | null> {
  const u = await db.user.findUnique({ where: { id: actorId }, include: { va: true } });
  return u?.va?.compensationRole ?? null;
}
