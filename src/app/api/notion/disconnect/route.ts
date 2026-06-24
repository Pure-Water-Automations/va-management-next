import { action } from "@/lib/api";
import { AuthorizationError } from "@/lib/auth/roles";
import { canManageNotionForOrg, resolveOrg } from "@/lib/auth/notion-access";
import { disconnectNotion } from "@/lib/notion-engine";

// Disconnect a client org's Notion sync. Body: { orgId|orgSlug }. Existing linked
// items keep their notionPageId/link but stop syncing until reconnected.
export const POST = action(async ({ user, body }) => {
  const org = await resolveOrg(body);
  if (!org) throw new Error("Unknown client organization");
  if (!(await canManageNotionForOrg(user, org.id))) throw new AuthorizationError("Not authorized for this client");
  await disconnectNotion(org.id);
  return { disconnected: true };
});
