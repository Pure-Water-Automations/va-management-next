import { env } from "@/lib/env";
import { getCurrentUser, isAllAccess } from "@/lib/auth/access";
import { authorizeUrl, signState, zoomOauthConfigured } from "@/lib/zoom/oauth";

// Redirects use APP_BASE_URL, not request.url (behind the tunnel the app sees
// localhost:8796, which would produce a dead redirect).
function appBase(): string {
  return (env.APP_BASE_URL || "https://dev-team.pwasecondbrain.uk").replace(/\/+$/, "");
}
function safePath(p: string | null): string {
  return p && p.startsWith("/") && !p.startsWith("//") ? p : "/admin/zoom";
}

// Kick off the "Connect Zoom" install flow. Admin-gated. ?return=<path>.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const ret = safePath(url.searchParams.get("return"));

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.redirect(`${appBase()}/login`, 302);
  }
  if (!isAllAccess(user)) return new Response("Not authorized", { status: 403 });
  if (!zoomOauthConfigured()) return Response.redirect(`${appBase()}${ret}?zoom=unconfigured`, 302);

  return Response.redirect(authorizeUrl(signState(user.email, ret)), 302);
}
