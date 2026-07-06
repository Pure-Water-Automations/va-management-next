import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import type { Role, CompRole } from "@prisma/client";
import { authOptions } from "@/lib/auth/nextauth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { viewForRole, type ConsoleView } from "@/lib/auth/roles";
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

/**
 * Caps for a user record loaded OUTSIDE a console session — e.g. the in-meeting
 * Zoom panel, whose viewers authenticate via the Zoom App context instead of
 * NextAuth/CF-Access. Same math as getCurrentUser().
 */
export async function capsForUser(user: {
  isAdmin: boolean;
  role: Role;
  email: string;
  va: { compensationRole: CompRole } | null;
}): Promise<Caps> {
  return capsFor(user, user.email);
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
const FOUNDER_EMAILS = new Set(
  (process.env.FOUNDER_EMAILS || "okamotomiak@gmail.com,j.okamoto@hji.edu")
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
 * Recordings (the Loom-style recorder + library) are open to ADMINS, not just
 * founders — so trusted staff (e.g. Aira) can record, review, and test. This is
 * deliberately broader than `isBetaVisible` (which keeps Enhance/Discover
 * founder-only) and independent of the beta toggle; the recorder is admin-gated,
 * so regular VAs never see it regardless.
 */
export function isRecordingsVisible(user: CurrentUser): boolean {
  return isAllAccess(user) || isFounder(user.email);
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
  if (picked) return picked;
  const first = await db.va.findFirst({
    where: { status: { in: ["active", "training"] } },
    orderBy: { name: "asc" },
    select: { vaId: true },
  });
  return first?.vaId ?? null;
}
