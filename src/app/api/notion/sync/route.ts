import { action } from "@/lib/api";
import { AuthorizationError } from "@/lib/auth/roles";
import { canManageNotionForOrg, resolveOrg } from "@/lib/auth/notion-access";
import { getConnection, syncConnection } from "@/lib/notion-engine";

// Trigger a Notion <-> console sync now for one org. Body: { orgId|orgSlug }.
export const POST = action(async ({ user, body }) => {
  const org = await resolveOrg(body);
  if (!org) throw new Error("Unknown client organization");
  if (!(await canManageNotionForOrg(user, org.id))) throw new AuthorizationError("Not authorized for this client");
  const conn = await getConnection(org.id);
  if (!conn?.active) throw new Error("No active Notion connection for this client");
  return syncConnection(conn);
});
