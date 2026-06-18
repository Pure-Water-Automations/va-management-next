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
