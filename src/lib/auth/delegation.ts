import { db } from "@/lib/db";
import type { CompRole, Role } from "@prisma/client";

/**
 * Tier-aware delegation & meeting-actions authority. HR was de-bloated out of
 * delegation, so "who can delegate / review meeting actions" is now:
 *   • all-access users (admin or the TESTER role) — always, OR
 *   • a VA whose comp tier has the matching flag on (admins configure these on the
 *     Compensation Roles screen; default Tier 3 "Senior" + Tier 4 "Lead").
 * Specialized roles (HR, People-Ops, Recruiter, Sales, Bookkeeper) do NOT delegate.
 */

export type DelegationFlags = {
  canDelegateTasks: boolean;
  canDelegateProjects: boolean;
  canReviewMeetingActions: boolean;
};

const NO_FLAGS: DelegationFlags = {
  canDelegateTasks: false,
  canDelegateProjects: false,
  canReviewMeetingActions: false,
};
const ALL_FLAGS: DelegationFlags = {
  canDelegateTasks: true,
  canDelegateProjects: true,
  canReviewMeetingActions: true,
};

/** The delegation flags configured for a comp tier on the Compensation Roles screen. */
export async function flagsForCompRole(roleId: CompRole): Promise<DelegationFlags> {
  const cr = await db.compensationRole.findUnique({
    where: { roleId },
    select: { canDelegateTasks: true, canDelegateProjects: true, canReviewMeetingActions: true },
  });
  return {
    canDelegateTasks: cr?.canDelegateTasks ?? false,
    canDelegateProjects: cr?.canDelegateProjects ?? false,
    canReviewMeetingActions: cr?.canReviewMeetingActions ?? false,
  };
}

/**
 * Resolve an actor (by login id) to their delegation flags: all-access → all on;
 * a VA → their comp tier's flags; anyone else (HR, Recruiter, …) → none.
 */
async function actorFlags(actorId: string): Promise<DelegationFlags> {
  const u = await db.user.findUnique({ where: { id: actorId }, include: { va: true } });
  if (!u) return NO_FLAGS;
  if (u.isAdmin || u.role === "TESTER") return ALL_FLAGS;
  // Some VA logins aren't linked to their Va row via User.vaId (accounts created
  // before the link existed), which would wrongly drop their authority. Fall back
  // to the email match (Va.email is unique and equals User.email), like getCurrentUser().
  let va = u.va ?? null;
  if (!va && u.email) va = await db.va.findUnique({ where: { email: u.email.toLowerCase() } });
  if (!va) return NO_FLAGS;
  return flagsForCompRole(va.compensationRole);
}

// The `role` arg is retained for call-site compatibility but no longer used — the
// decision is derived from the actor's admin/tester flag or their comp tier.
export async function canUserDelegateTasks(actorId: string, _role?: Role): Promise<boolean> {
  return (await actorFlags(actorId)).canDelegateTasks;
}

export async function canUserDelegateProjects(actorId: string, _role?: Role): Promise<boolean> {
  return (await actorFlags(actorId)).canDelegateProjects;
}

export async function canUserReviewMeetingActions(actorId: string, _role?: Role): Promise<boolean> {
  return (await actorFlags(actorId)).canReviewMeetingActions;
}

/**
 * Authority judged directly from a VA row's comp tier — no login required. Used
 * when an admin previews "View as → a VA" who may not have a linked User account,
 * so the nav matches what that VA's tier actually grants.
 */
export async function canVaDelegateTasks(vaId: string): Promise<boolean> {
  const va = await db.va.findUnique({ where: { vaId }, select: { compensationRole: true } });
  if (!va) return false;
  return (await flagsForCompRole(va.compensationRole)).canDelegateTasks;
}

export async function canVaReviewMeetingActions(vaId: string): Promise<boolean> {
  const va = await db.va.findUnique({ where: { vaId }, select: { compensationRole: true } });
  if (!va) return false;
  return (await flagsForCompRole(va.compensationRole)).canReviewMeetingActions;
}

/** The actor's comp tier (TRAINEE..TIER_4) or null if they're not a VA. */
export async function getActorTier(actorId: string): Promise<string | null> {
  const u = await db.user.findUnique({ where: { id: actorId }, include: { va: true } });
  return u?.va?.compensationRole ?? null;
}
