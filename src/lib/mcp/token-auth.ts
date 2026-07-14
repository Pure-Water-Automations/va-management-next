// Bearer-token → actor resolution for the Delegation MCP (/api/mcp/delegate).
//
// Per-user tokens (McpToken table) are minted by an admin at /admin/mcp-tokens
// and stored hashed. The MCP acts AS that user: writes are attributed to them
// and their delegation authority decides what they may do. This is the path
// team leads, senior VAs, and delegation-tier VAs use from their AI connector.

import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { canUserDelegateTasks, canUserDelegateProjects } from "@/lib/auth/delegation";
import type { Role } from "@prisma/client";

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mint a new plaintext token. The "vam_" prefix makes leaked tokens greppable. */
export function generateMcpToken(): string {
  return `vam_${randomBytes(24).toString("hex")}`;
}

/** Client-portal accounts get no MCP access at all. */
export function isMcpEligibleRole(role: Role): boolean {
  return role !== "CLIENT_ADMIN" && role !== "CLIENT_MEMBER";
}

export type DelegationActor = {
  actorId: string;
  actorEmail: string;
  actorName: string | null;
  actorRole: Role;
  canDelegateTasks: boolean;
  canDelegateProjects: boolean;
};

export type McpAuthResult =
  | { ok: true; actor: DelegationActor }
  | { ok: false; status: number; message: string };

export async function resolveDelegationActor(bearer: string): Promise<McpAuthResult> {
  if (!bearer) return { ok: false, status: 401, message: "Unauthorized — missing bearer token." };

  const row = await db.mcpToken.findUnique({
    where: { tokenHash: hashMcpToken(bearer) },
    include: { user: { select: { id: true, email: true, name: true, role: true, active: true } } },
  });
  if (!row) return { ok: false, status: 401, message: "Unauthorized — invalid bearer token." };
  if (row.revokedAt) return { ok: false, status: 401, message: "This MCP token has been revoked." };
  if (!row.user.active) return { ok: false, status: 401, message: "This account is deactivated." };
  if (!isMcpEligibleRole(row.user.role)) return { ok: false, status: 403, message: "Client-portal accounts cannot use the MCP." };

  // Best-effort usage stamp — never let it fail the request.
  db.mcpToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  const [canDelegateTasks, canDelegateProjects] = await Promise.all([
    canUserDelegateTasks(row.user.id, row.user.role),
    canUserDelegateProjects(row.user.id, row.user.role),
  ]);

  return {
    ok: true,
    actor: {
      actorId: row.user.id,
      actorEmail: row.user.email,
      actorName: row.user.name,
      actorRole: row.user.role,
      canDelegateTasks,
      canDelegateProjects,
    },
  };
}
