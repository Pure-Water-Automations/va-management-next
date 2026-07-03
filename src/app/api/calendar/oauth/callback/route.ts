import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { env } from "@/lib/env";
import { calendarOauthClient, verifyCalState, safeReturn } from "@/lib/calendar-oauth";
import { upsertCalendarConnection } from "@/lib/calendar-connection";
import { audit } from "@/lib/activity";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ? verifyCalState(url.searchParams.get("state")!) : null;
  const ret = safeReturn(state?.ret);

  if (url.searchParams.get("error")) redirect(`${ret}?calendar=${encodeURIComponent(url.searchParams.get("error")!)}`);
  if (!code || !state) redirect(`${ret}?calendar=bad_state`);

  const canBindAny = user.isAdmin || user.role === "HR_MANAGER" || user.role === "PEOPLE_OPS";
  if (!canBindAny && state.repEmail !== user.email.toLowerCase()) redirect(`${ret}?calendar=forbidden`);

  const client = calendarOauthClient();
  if (!client) redirect(`${ret}?calendar=not_configured`);

  try {
    const { tokens } = await client!.getToken(code);
    if (!tokens.refresh_token) redirect(`${ret}?calendar=norefresh`);

    let email = "";
    try {
      const info = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      }).then((r) => r.json() as Promise<{ email?: string }>);
      email = info.email ?? "";
    } catch {
      email = "";
    }

    // A non-admin rep may only bind their OWN Google account to their own rep row.
    if (!canBindAny && email.toLowerCase() !== user.email.toLowerCase()) {
      redirect(`${ret}?calendar=forbidden`);
    }

    await upsertCalendarConnection({
      repEmail: state.repEmail,
      clientId: env.GOOGLE_OAUTH_CLIENT_ID!.trim(),
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET!.trim(),
      refreshToken: tokens.refresh_token!,
      accessToken: tokens.access_token ?? null,
      tokenUri: "https://oauth2.googleapis.com/token",
      expiryDate: tokens.expiry_date ?? null,
      scope: tokens.scope ?? null,
      email,
      createdByEmail: user.email,
    });
    await audit({ actorEmail: user.email, action: "calendar_connected", target: state.repEmail, details: { google: email } });

    redirect(`${ret}?calendar=connected`);
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err; // re-throw Next redirect
    console.error("[calendar-oauth] exchange failed:", err instanceof Error ? err.message : err);
    redirect(`${ret}?calendar=exchange_failed`);
  }
}
