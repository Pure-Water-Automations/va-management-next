import { getCurrentUser } from "@/lib/auth/access";
import { authorizeUrl, signState, zoomOauthConfigured } from "@/lib/zoom/oauth";

// Kick off the "Connect Zoom" install flow. Admin-gated. ?return=<path>.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const ret = url.searchParams.get("return") || "/admin";

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.redirect(new URL("/login", request.url));
  }
  if (!user.isAdmin) return new Response("Not authorized", { status: 403 });
  if (!zoomOauthConfigured()) return Response.redirect(new URL(`${ret}?zoom=unconfigured`, request.url));

  return Response.redirect(authorizeUrl(signState(user.email, ret)), 302);
}
