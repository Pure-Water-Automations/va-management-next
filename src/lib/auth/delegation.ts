import { db } from "@/lib/db";
import type { CompRole, Role } from "@prisma/client";

/**
 * Tier-aware delegation authority (card #22). HR Manager / People-Ops / Team-Lead
 * always delegate. A VA / Senior-VA delegates only if their comp tier's
 * configurable flag is on (admin sets these on the Compensation Roles screen;
 * default Tier 3 "Senior VA" + Tier 4 "Lead").
 */

const MANAGER_ROLES = new Set<Role>(["HR_MANAGER", "PEOPLE_OPS", "TEAM_LEAD"]);

type DelegationFlags = { canDelegateTasks: boolean; canDelegateProjects: boolean };

/** The delegation flags configured for a comp tier on the Compensation Roles screen. */
async function flagsForCompRole(roleId: CompRole): Promise<DelegationFlags> {
  const cr = await db.compensationRole.findUnique({
    where: { roleId },
    select: { canDelegateTasks: true, canDelegateProjects: true },
  });
  return {
    canDelegateTasks: cr?.canDelegateTasks ?? false,
    canDelegateProjects: cr?.canDelegateProjects ?? false,
  };
}

async function tierFlags(actorId: string): Promise<DelegationFlags & { tier: string | null }> {
  const u = await db.user.findUnique({ where: { id: actorId }, include: { va: true } });
  // Some VA logins aren't linked to their Va row via User.vaId (e.g. accounts
  // created before the link existed), which would wrongly drop their delegation
  // authority. Fall back to the email match (Va.email is unique and equals
  // User.email), mirroring getCurrentUser().
  let va = u?.va ?? null;
  if (!va && u?.email) {
    va = await db.va.findUnique({ where: { email: u.email.toLowerCase() } });
  }
  if (!va) return { tier: null, canDelegateTasks: false, canDelegateProjects: false };
  return { tier: va.compensationRole as string, ...(await flagsForCompRole(va.compensationRole)) };
}

export async function canUserDelegateTasks(actorId: string, role: Role): Promise<boolean> {
  if (MANAGER_ROLES.has(role)) return true;
  return (await tierFlags(actorId)).canDelegateTasks;
}

export async function canUserDelegateProjects(actorId: string, role: Role): Promise<boolean> {
  if (MANAGER_ROLES.has(role)) return true;
  return (await tierFlags(actorId)).canDelegateProjects;
}

/**
 * Delegation authority judged directly from a VA row's comp tier — no login
 * required. Used when an admin previews "View as → a VA" who may not have a
 * linked User account, so the nav matches what that VA's tier actually grants.
 */
export async function canVaDelegateTasks(vaId: string): Promise<boolean> {
  const va = await db.va.findUnique({ where: { vaId }, select: { compensationRole: true } });
  if (!va) return false;
  return (await flagsForCompRole(va.compensationRole)).canDelegateTasks;
}

/** The actor's comp tier (TRAINEE..TIER_4) or null if they're not a VA. */
export async function getActorTier(actorId: string): Promise<string | null> {
  const u = await db.user.findUnique({ where: { id: actorId }, include: { va: true } });
  return u?.va?.compensationRole ?? null;
}
