import { getCurrentUser } from "@/lib/auth/access";
import { canManageNotionForOrg } from "@/lib/auth/notion-access";
import { db } from "@/lib/db";
import { listConnectableDatabases } from "@/lib/notion-engine";

// List the databases the org's connected Notion token can reach + an AI/heuristic
// guess of which is Projects vs Tasks (drives the post-OAuth picker). ?org=<id>.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const orgId = url.searchParams.get("org") ?? "";

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  const org = await db.clientOrganization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) return Response.json({ ok: false, error: "Unknown organization" }, { status: 400 });
  if (!(await canManageNotionForOrg(user, org.id))) return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });

  try {
    const result = await listConnectableDatabases(org.id);
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Failed to list databases" }, { status: 400 });
  }
}
