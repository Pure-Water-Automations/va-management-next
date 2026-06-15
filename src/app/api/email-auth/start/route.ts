import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/access";
import { oauthClient, SENDER_SCOPES } from "@/lib/email-oauth";

// Admin starts the OAuth consent to connect the sending Gmail account.
export async function GET() {
  const user = await getCurrentUser();
  if (!user.isAdmin) redirect("/");

  const client = oauthClient();
  if (!client) redirect("/admin/email?error=no_client");

  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  (await cookies()).set("email_oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });

  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: SENDER_SCOPES,
    state,
  });
  redirect(url);
}
