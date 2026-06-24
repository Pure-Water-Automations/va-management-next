import { action, str } from "@/lib/api";
import { assignToClient, unassignFromClient } from "@/lib/actions/team";
import type { ClientTeamRole } from "@prisma/client";

// Assign / update / remove a staff member on a client's team.
// Body: { orgId, userId, role?: "LEAD"|"MEMBER", action?: "remove" }.
export const POST = action(async ({ user, body }) => {
  const actor = { role: user.role, isAdmin: user.isAdmin };
  const orgId = str(body, "orgId");
  const userId = str(body, "userId");
  if (body.action === "remove") return unassignFromClient(actor, orgId, userId);
  const role: ClientTeamRole = body.role === "LEAD" ? "LEAD" : "MEMBER";
  return assignToClient(actor, orgId, userId, role);
});
