import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { isSalesRep } from "@/lib/auth/roles";
import { authorizeCalendarUrl, signCalState, calendarOauthConfigured } from "@/lib/calendar-oauth";

// Admin / HR may connect any rep's calendar; a sales rep may connect only their own.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!isSalesRep(user.role) && !user.isAdmin) redirect("/");

  const url = new URL(request.url);
  const repEmail = (url.searchParams.get("rep") || user.email).toLowerCase();
  const ret = url.searchParams.get("return") || "/sales/calendar";

  const canBindAny = user.isAdmin || user.role === "HR_MANAGER" || user.role === "PEOPLE_OPS";
  if (!canBindAny && repEmail !== user.email.toLowerCase()) redirect(`${ret}?calendar=forbidden`);
  if (!calendarOauthConfigured()) redirect(`${ret}?calendar=not_configured`);

  const authUrl = authorizeCalendarUrl(signCalState(repEmail, ret));
  if (!authUrl) redirect(`${ret}?calendar=not_configured`);
  redirect(authUrl);
}
