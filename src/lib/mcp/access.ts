// Role gating for MCP tools. Pure + DB-free so it's unit-testable: given who
// the caller is, which tools do they see (tools/list) and may they call
// (tools/call)? Mirrors the console's own authority model (src/lib/auth/roles.ts
// + src/lib/auth/delegation.ts) so the MCP never grants more than the web UI:
// specialized roles gate their own console's tools, delegation is TIER-driven
// (resolved once at auth time into `canDelegate`), and all-access users
// (User.isAdmin or the TESTER role) pass everything.

import type { Role } from "@prisma/client";
import { isRecruiter, isSalesRep } from "@/lib/auth/roles";

/** Who the MCP is acting as — resolved from the bearer token (see ./auth.ts). */
export type McpActor = {
  actorId: string;
  actorEmail: string;
  actorName: string | null;
  actorRole: Role;
  isAdmin: boolean;
  /** Tier-driven delegation authority (canUserDelegateTasks), resolved at auth time. */
  canDelegate: boolean;
  vaId: string | null;
};

type GateActor = Pick<McpActor, "actorRole" | "isAdmin" | "canDelegate">;

/**
 * Every tool belongs to exactly one access group. "staff" = any non-client
 * console login (VAs included); "delegator" follows the tier-driven delegation
 * flag; the rest map onto the console's specialized roles.
 */
export type McpAccessGroup = "staff" | "delegator" | "hr" | "payroll" | "recruitment" | "sales";

const GROUP_ALLOWS: Record<McpAccessGroup, (actor: GateActor) => boolean> = {
  staff: () => true,
  delegator: (a) => a.canDelegate,
  hr: (a) => a.actorRole === "HR_MANAGER" || a.actorRole === "PEOPLE_OPS",
  payroll: (a) => a.actorRole === "BOOKKEEPER" || a.actorRole === "HR_MANAGER",
  recruitment: (a) => isRecruiter(a.actorRole),
  sales: (a) => isSalesRep(a.actorRole),
};

/** Client-portal roles get no MCP access at all (rejected at auth). */
export function isMcpEligibleRole(role: Role): boolean {
  return role !== "CLIENT_ADMIN" && role !== "CLIENT_MEMBER";
}

/** All-access users see every tool — same bypass the web app gives them. */
export function isAllAccess(actor: Pick<McpActor, "actorRole" | "isAdmin">): boolean {
  return actor.isAdmin || actor.actorRole === "TESTER";
}

export function actorAllows(actor: GateActor, group: McpAccessGroup): boolean {
  if (!isMcpEligibleRole(actor.actorRole)) return false;
  if (isAllAccess(actor)) return true;
  return GROUP_ALLOWS[group](actor);
}

export function visibleTools<T extends { access: McpAccessGroup }>(tools: T[], actor: GateActor): T[] {
  return tools.filter((t) => actorAllows(actor, t.access));
}
