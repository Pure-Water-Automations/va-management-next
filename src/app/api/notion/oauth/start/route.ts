import { getCurrentUser } from "@/lib/auth/access";
import { canManageNotionForOrg } from "@/lib/auth/notion-access";
import { db } from "@/lib/db";
import { authorizeUrl, notionOauthConfigured, signState } from "@/lib/notion-oauth";

// Kick off the one-click "Connect with Notion" OAuth flow. ?org=<id>&return=<path>.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const orgId = url.searchParams.get("org") ?? "";
  const ret = url.searchParams.get("return") || "/client/settings";

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.redirect(new URL("/login", request.url));
  }

  if (!notionOauthConfigured()) {
    return Response.redirect(new URL(`${ret}?notion=manual`, request.url));
  }
  const org = await db.clientOrganization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) return new Response("Unknown organization", { status: 400 });
  if (!(await canManageNotionForOrg(user, org.id))) return new Response("Not authorized", { status: 403 });

  return Response.redirect(authorizeUrl(signState(org.id, ret)), 302);
}
