import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/access";
import { isSalesRep, viewForRole } from "@/lib/auth/roles";
import { isSalesConsoleMode } from "@/lib/mode";

// Shared guard for every Sales / Marketing / Leadership console page.
// Normally sales reps + admins only; on a sales-console deployment
// (CONSOLE_MODE="sales") every staff login is allowed in — the whole
// instance IS the sales console — while client logins stay in the portal.
export async function requireSalesUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (viewForRole(user.role) === "CLIENT") redirect("/client");
  if (!isSalesRep(user.role) && !user.isAdmin && !isSalesConsoleMode()) redirect("/");
  return user;
}
