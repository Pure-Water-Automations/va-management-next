import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { exchangeCode, getMe, verifyState } from "@/lib/zoom/oauth";
import { upsertZoomConnection } from "@/lib/zoom/connection";

// Redirects are built from APP_BASE_URL, NOT request.url: behind the Cloudflare
// tunnel the app sees its internal host (localhost:8796), so a request.url-relative
// redirect would bounce the browser to a dead local address.
function appBase(): string {
  return (env.APP_BASE_URL || "https://dev-team.pwasecondbrain.uk").replace(/\/+$/, "");
}
// Only allow same-site absolute paths (guards against //evil.com open redirects).
function safePath(p: string | undefined): string {
  return p && p.startsWith("/") && !p.startsWith("//") ? p : "/admin";
}

// OAuth redirect target: exchange the code for tokens, look up the Zoom account
// identity, and store the connection (linked to the installing app User carried in
// the signed state). The signed state is the CSRF proof.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const payload = state ? verifyState(state) : null;
  const ret = safePath(payload?.ret);
  const back = (flag: string) => Response.redirect(`${appBase()}${ret}?zoom=${flag}`, 302);

  if (oauthError || !code || !payload) {
    await logActivity({
      source: "zoom",
      eventType: "zoom_oauth_error",
      severity: "warning",
      summary: `Zoom OAuth callback rejected: ${oauthError ? `provider error "${oauthError}"` : !code ? "no code" : "bad/expired state"}`,
    }).catch(() => {});
    return back("error");
  }

  try {
    const tok = await exchangeCode(code);
    const me = await getMe(tok.access_token);
    const installer = await db.user.findUnique({
      where: { email: payload.email.toLowerCase() },
      select: { id: true },
    });
    await upsertZoomConnection({
      zoomUserId: me.id,
      email: me.email,
      userId: installer?.id ?? null,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresInSec: tok.expires_in,
      scopes: tok.scope ?? null,
    });
  } catch (err) {
    await logActivity({
      source: "zoom",
      eventType: "zoom_oauth_error",
      severity: "error",
      summary: `Zoom OAuth callback failed: ${err instanceof Error ? err.message : String(err)}`,
    }).catch(() => {});
    return back("error");
  }
  return back("connected");
}
