import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/nextauth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { viewForRole, type ConsoleView } from "@/lib/auth/roles";

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

  return user;
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

// CLIENT is intentionally excluded — admins cannot cookie-switch into the client portal view.
const VIEWS: ConsoleView[] = ["HR", "PAYROLL", "RECRUITMENT", "VA"];

/**
 * The console an admin is currently viewing. Admins can switch consoles via the
 * `va_view` cookie; everyone else gets the view their role implies.
 */
export async function getEffectiveView(user: CurrentUser): Promise<ConsoleView> {
  if (user.isAdmin) {
    const picked = (await cookies()).get("va_view")?.value as ConsoleView | undefined;
    if (picked && VIEWS.includes(picked)) return picked;
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
  if (!user.isAdmin) return null;
  const picked = (await cookies()).get("va_as_va")?.value;
  if (picked) return picked;
  const first = await db.va.findFirst({
    where: { status: { in: ["active", "training"] } },
    orderBy: { name: "asc" },
    select: { vaId: true },
  });
  return first?.vaId ?? null;
}
