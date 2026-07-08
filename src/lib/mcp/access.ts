// Role gating for MCP tools. Pure + DB-free so it's unit-testable: given who
// the caller is, which tools do they see (tools/list) and may they call
// (tools/call)? Mirrors the console's own role helpers (src/lib/auth/roles.ts)
// so the MCP never grants more than the web UI would.

import type { Role } from "@prisma/client";
import { canManageTasks, isGateReviewer, isRecruiter, isSalesRep } from "@/lib/auth/roles";

/** Who the MCP is acting as — resolved from the bearer token. */
export type McpActor = {
  actorId: string;
  actorEmail: string;
  actorName: string | null;
  actorRole: Role;
  isAdmin: boolean;
  vaId: string | null;
};

/**
 * Every tool belongs to exactly one access group. "staff" = any non-client
 * console login (VAs included); the rest map onto the console's role helpers.
 * Admins (User.isAdmin) pass every group, same as in the web app.
 */
export type McpAccessGroup = "staff" | "delegator" | "hr" | "payroll" | "recruitment" | "sales";

const GROUP_ALLOWS: Record<McpAccessGroup, (role: Role) => boolean> = {
  staff: () => true,
  delegator: (role) => canManageTasks(role),
  hr: (role) => isGateReviewer(role), // HR_MANAGER, PEOPLE_OPS, TEAM_LEAD
  payroll: (role) => role === "BOOKKEEPER" || role === "HR_MANAGER",
  recruitment: (role) => isRecruiter(role),
  sales: (role) => isSalesRep(role),
};

/** Client-portal roles get no MCP access at all (rejected at auth). */
export function isMcpEligibleRole(role: Role): boolean {
  return role !== "CLIENT_ADMIN" && role !== "CLIENT_MEMBER";
}

export function actorAllows(actor: Pick<McpActor, "actorRole" | "isAdmin">, group: McpAccessGroup): boolean {
  if (!isMcpEligibleRole(actor.actorRole)) return false;
  if (actor.isAdmin) return true;
  return GROUP_ALLOWS[group](actor.actorRole);
}

export function visibleTools<T extends { access: McpAccessGroup }>(
  tools: T[],
  actor: Pick<McpActor, "actorRole" | "isAdmin">,
): T[] {
  return tools.filter((t) => actorAllows(actor, t.access));
}
