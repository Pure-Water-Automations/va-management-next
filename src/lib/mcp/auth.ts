// Bearer-token → actor resolution for the MCP endpoint.
//
// Two kinds of credentials:
//  1. Per-user tokens (McpToken table) — minted by an admin at /admin/mcp-tokens,
//     stored hashed. The MCP acts AS that user: writes are attributed to them and
//     their role decides which tools they see. This is the normal path for HR,
//     team leads, senior VAs, and VAs using the connector themselves.
//  2. The legacy MCP_API_TOKEN env var — a single service credential that acts as
//     MCP_ACTOR_EMAIL (default: Justin). Kept so existing connector configs keep
//     working; treat it as the admin/service identity.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { isMcpEligibleRole, type McpActor } from "./access";

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mint a new plaintext token. The "vam_" prefix makes leaked tokens greppable. */
export function generateMcpToken(): string {
  return `vam_${randomBytes(24).toString("hex")}`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export type McpAuthResult =
  | { ok: true; actor: McpActor; via: "user-token" | "service-token" }
  | { ok: false; status: number; message: string };

export async function resolveMcpActor(bearer: string): Promise<McpAuthResult> {
  if (!bearer) return { ok: false, status: 401, message: "Unauthorized — missing bearer token." };

  // 1) Per-user token.
  const row = await db.mcpToken.findUnique({
    where: { tokenHash: hashMcpToken(bearer) },
    include: { user: { select: { id: true, email: true, name: true, role: true, isAdmin: true, active: true, vaId: true } } },
  });
  if (row) {
    if (row.revokedAt) return { ok: false, status: 401, message: "This MCP token has been revoked." };
    if (!row.user.active) return { ok: false, status: 401, message: "This account is deactivated." };
    if (!isMcpEligibleRole(row.user.role)) return { ok: false, status: 403, message: "Client-portal accounts cannot use the MCP." };
    // Best-effort usage stamp — never let it fail the request.
    db.mcpToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return {
      ok: true,
      via: "user-token",
      actor: {
        actorId: row.user.id,
        actorEmail: row.user.email,
        actorName: row.user.name,
        actorRole: row.user.role,
        isAdmin: row.user.isAdmin,
        vaId: row.user.vaId,
      },
    };
  }

  // 2) Legacy shared service token (env).
  const serviceToken = process.env.MCP_API_TOKEN?.trim();
  if (serviceToken && safeEqual(bearer, serviceToken)) {
    const actorEmail = (process.env.MCP_ACTOR_EMAIL || "okamotomiak@gmail.com").toLowerCase();
    const user = await db.user.findUnique({
      where: { email: actorEmail },
      select: { id: true, email: true, name: true, role: true, isAdmin: true, active: true, vaId: true },
    });
    if (!user || !user.active) return { ok: false, status: 500, message: `MCP service user (${actorEmail}) not found or inactive.` };
    return {
      ok: true,
      via: "service-token",
      actor: {
        actorId: user.id,
        actorEmail: user.email,
        actorName: user.name,
        actorRole: user.role,
        // The shared service token has always been the admin credential — keep that
        // even if the service user's row isn't flagged isAdmin.
        isAdmin: true,
        vaId: user.vaId,
      },
    };
  }

  return { ok: false, status: 401, message: "Unauthorized — invalid bearer token." };
}
