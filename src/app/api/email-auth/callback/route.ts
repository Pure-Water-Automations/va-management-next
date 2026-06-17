import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { oauthClient, senderTokenPath } from "@/lib/email-oauth";
import { audit } from "@/lib/activity";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user.isAdmin) redirect("/");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("email_oauth_state")?.value;
  jar.delete("email_oauth_state");

  if (url.searchParams.get("error")) redirect(`/admin/email?error=${url.searchParams.get("error")}`);
  if (!code || !state || state !== expected) redirect("/admin/email?error=bad_state");

  const client = oauthClient();
  if (!client) redirect("/admin/email?error=no_client");

  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Which account did they authorize? Read it from the userinfo scope (we
    // requested userinfo.email) — gmail.getProfile would need a Gmail read scope.
    let email = "";
    try {
      const info = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      }).then((r) => r.json() as Promise<{ email?: string }>);
      email = info.email ?? "";
    } catch {
      email = "";
    }

    const tokenJson = {
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry_date: tokens.expiry_date,
      email,
    };

    const { writeFile, mkdir } = await import("fs/promises");
    const { dirname, isAbsolute, resolve } = await import("path");
    const path = isAbsolute(senderTokenPath()) ? senderTokenPath() : resolve(process.cwd(), senderTokenPath());
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(tokenJson, null, 2), { mode: 0o600 });

    if (email) {
      await db.setting.upsert({ where: { key: "system_email_from" }, update: { value: email }, create: { key: "system_email_from", value: email } });
    }
    await audit({ actorEmail: user.email, action: "email_sender_connected", target: email, details: { hasRefresh: !!tokens.refresh_token } });

    redirect(`/admin/email?connected=${encodeURIComponent(email)}${tokens.refresh_token ? "" : "&norefresh=1"}`);
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err; // re-throw Next redirect
    console.error("[email-auth] exchange failed:", err instanceof Error ? err.message : err);
    redirect("/admin/email?error=exchange_failed");
  }
}
