import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import type { Role, CompRole } from "@prisma/client";
import { authOptions } from "@/lib/auth/nextauth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { viewForRole, isGateReviewer, type ConsoleView } from "@/lib/auth/roles";
import { flagsForCompRole } from "@/lib/auth/delegation";

/**
 * Delegation / meeting-actions capabilities, precomputed once per request so guards
 * read a plain flag instead of doing role math. Tier-driven for VAs; all-on for
 * all-access users; off for specialized roles (HR, Recruiter, Sales, Bookkeeper).
 */
export type Caps = { manageTasks: boolean; manageProjects: boolean; reviewMeetingActions: boolean };

/** All-access = platform admin OR the QA `TESTER` role. Sees and does everything. */
export function isAllAccess(user: { isAdmin: boolean; role: Role }): boolean {
  return user.isAdmin || user.role === "TESTER";
}

async function capsFor(
  user: { isAdmin: boolean; role: Role; va: { compensationRole: CompRole } | null },
  email: string,
): Promise<Caps> {
  if (isAllAccess(user)) return { manageTasks: true, manageProjects: true, reviewMeetingActions: true };
  let va: { compensationRole: CompRole } | null = user.va;
  if (!va) {
    va = await db.va.findUnique({
      where: { email: email.toLowerCase() },
      select: { compensationRole: true },
    });
  }
  if (!va) return { manageTasks: false, manageProjects: false, reviewMeetingActions: false };
  const f = await flagsForCompRole(va.compensationRole);
  return {
    manageTasks: f.canDelegateTasks,
    manageProjects: f.canDelegateProjects,
    reviewMeetingActions: f.canReviewMeetingActions,
  };
}

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  const sessionEmail = session?.user?.email ?? undefined;
  const fallbackEmail =
    process.env.NODE_ENV !== "production" ? env.DEV_AUTH_EMAIL : undefined;
  const email = sessionEmail ?? fallbackEmail;

  if (!email) {
    redirect("/login");
  }

  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { va: true },
  });

  if (!user || !user.active) {
    throw new Error(`No active VA Management account for ${email}`);
  }

  const caps = await capsFor(user, email);
  return { ...user, caps };
}

export type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

// "Founder" gate — stricter than isAdmin (other staff like Aira are also admins).
// Used to keep beta/experimental features (Enhance, Discover, Recordings) visible
// to Justin only. Override the allow-list with the FOUNDER_EMAILS env var.
//
// `??` (not `||`) so an explicitly EMPTY FOUNDER_EMAILS="" means "no founders"
// (the production/official deployment sets this to disable Enhance/Discover).
// Only an UNSET var falls back to the default founder list (dev/staging).
const FOUNDER_EMAILS = new Set(
  (process.env.FOUNDER_EMAILS ?? "okamotomiak@gmail.com,j.okamoto@hji.edu")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);
export function isFounder(email: string | null | undefined): boolean {
  return !!email && FOUNDER_EMAILS.has(email.toLowerCase());
}

/**
 * Beta features (Enhance, Discover, Recordings) are founder-only AND runtime-
 * toggleable, so the founder can hide them on demand — e.g. while demoing the
 * console to the VA team. Controlled by the `va_beta` cookie (default ON); the
 * value "off" hides them. Non-founders never see beta regardless of the cookie.
 */
export async function isBetaOn(): Promise<boolean> {
  return (await cookies()).get("va_beta")?.value !== "off";
}

export async function isBetaVisible(email: string | null | undefined): Promise<boolean> {
  return isFounder(email) && (await isBetaOn());
}

/**
 * Recordings (the Loom-style recorder + library) are open to any staff user with a
 * linked VA record, plus HR/People-Ops/Recruiter (review authority) and all-access
 * users — clients never reach this VA-facing UI (they see videos shared with their
 * org through the separate client portal instead). This gate only decides who can
 * reach the pages at all; per-recording visibility (own + supervisor chain) is
 * enforced separately by `canSeeRecording`.
 *
 * The whole feature can be killed per-deployment with `RECORDINGS_ENABLED=false`
 * (the production/official deployment sets this) so it's hidden from everyone.
 */
export function isRecordingsVisible(user: CurrentUser): boolean {
  if (!env.RECORDINGS_ENABLED) return false;
  if (isAllAccess(user) || isFounder(user.email)) return true;
  return !!user.vaId || isGateReviewer(user.role);
}

// CLIENT is intentionally excluded — admins cannot cookie-switch into the client portal view.
const VIEWS: ConsoleView[] = ["ADMIN", "HR", "PAYROLL", "RECRUITMENT", "SALES", "VA"];

/**
 * The console an all-access user is currently viewing. They can switch consoles via
 * the `va_view` cookie and default to the Admin console; everyone else gets the view
 * their role implies. ADMIN is only ever reachable by all-access users (the cookie
 * check lives inside the isAllAccess branch).
 */
export async function getEffectiveView(user: CurrentUser): Promise<ConsoleView> {
  if (isAllAccess(user)) {
    const picked = (await cookies()).get("va_view")?.value as ConsoleView | undefined;
    if (picked && VIEWS.includes(picked)) return picked;
    return "ADMIN";
  }
  // A non-admin user who is also linked to a VA record (e.g. Riza, Princess) can
  // flip into their OWN VA console via the `va_self_view` cookie. This grants no
  // extra power — getEffectiveActor still returns `self` for non-admins, so all
  // capability/write checks stay self-scoped; they only see their own VA data.
  if (!user.isAdmin && user.vaId) {
    const self = (await cookies()).get("va_self_view")?.value;
    if (self === "VA") return "VA";
  }
  return viewForRole(user.role);
}

/**
 * The VA whose data the VA console should show. Normally the signed-in VA; for an
 * admin testing the VA console, an impersonated VA (cookie `va_as_va`, else the
 * first active VA).
 */
export async function getEffectiveVaId(user: CurrentUser): Promise<string | null> {
  if (user.vaId) return user.vaId;
  if (!isAllAccess(user)) return null;
  const picked = (await cookies()).get("va_as_va")?.value;
  // Validate the cookie still points to an active/training VA — a stale value
  // (e.g. a VA that was removed or deactivated) would otherwise yield a blank
  // "as VA" picker and silently fall back to the admin's own console.
  if (picked) {
    const ok = await db.va.findFirst({
      where: { vaId: picked, status: { in: ["active", "training"] } },
      select: { vaId: true },
    });
    if (ok) return picked;
  }
  const first = await db.va.findFirst({
    where: { status: { in: ["active", "training"] } },
    orderBy: { name: "asc" },
    select: { vaId: true },
  });
  return first?.vaId ?? null;
}

/**
 * The principal that VA-console capability checks AND write authorization should
 * run against — so an admin's "View as → as VA" preview matches exactly what that
 * VA can see and do.
 *
 * Normally this is just the logged-in user. When an admin is impersonating a
 * specific VA (effective view === "VA" AND `va_as_va` is set to a VA other than
 * their own), it resolves the impersonated VA's LOGIN — keyed by **email**
 * (`Va.email` is unique and equals `User.email`; `User.vaId` is unreliable since
 * some logins, e.g. Aira, aren't linked to their VA row) — and returns that
 * login's id/role with **all admin/founder powers forced OFF** (`isAdmin:false`,
 * `impersonating:true`). A VA with no matching login falls back to a safe,
 * non-privileged actor (role "VA") so the preview under-shows, never over-shows.
 *
 * Non-admins, and admins NOT in VA-impersonation mode, always get themselves —
 * so normal behavior (incl. the admin role-bypass in `action()`) is unchanged.
 */
export type EffectiveActor = {
  id: string;
  role: Role;
  isAdmin: boolean;
  email: string;
  vaId: string | null;
  name: string | null;
  impersonating: boolean;
};

export async function getEffectiveActor(user: CurrentUser): Promise<EffectiveActor> {
  const self: EffectiveActor = {
    id: user.id,
    role: user.role,
    isAdmin: user.isAdmin,
    email: user.email,
    vaId: user.vaId,
    name: user.name,
    impersonating: false,
  };
  if (!user.isAdmin) return self;
  if ((await getEffectiveView(user)) !== "VA") return self;
  const impVaId = await getEffectiveVaId(user);
  if (!impVaId || impVaId === user.vaId) return self;
  const impVa = await db.va.findUnique({
    where: { vaId: impVaId },
    select: { email: true, name: true },
  });
  if (!impVa) return self;
  const impUser = await db.user.findUnique({
    where: { email: impVa.email },
    select: { id: true, role: true, name: true },
  });
  return {
    id: impUser?.id ?? user.id,
    role: impUser?.role ?? "VA",
    isAdmin: false,
    email: impVa.email,
    vaId: impVaId,
    name: impUser?.name ?? impVa.name,
    impersonating: true,
  };
}
