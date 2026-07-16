import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getCurrentUser, isAllAccess, type CurrentUser } from "@/lib/auth/access";
import { isSalesRep, viewForRole } from "@/lib/auth/roles";
import { isSalesConsoleMode } from "@/lib/mode";

// Shared guard for every Sales console page. Sales reps + all-access users
// (admins AND the QA TESTER role — guarding on isAdmin alone re-creates the
// TESTER redirect loop /sales was already fixed for once). On a sales-console
// deployment (CONSOLE_MODE="sales") every staff login is allowed in — the
// whole instance IS the sales console — while client logins stay in the portal.
export function salesAccessFor(user: { role: Role; isAdmin: boolean }): "ok" | "client" | "home" {
  if (viewForRole(user.role) === "CLIENT") return "client";
  if (isSalesRep(user.role) || isAllAccess(user) || isSalesConsoleMode()) return "ok";
  return "home";
}

export async function requireSalesUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  const access = salesAccessFor(user);
  if (access === "client") redirect("/client");
  if (access === "home") redirect("/");
  return user;
}
