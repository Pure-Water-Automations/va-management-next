"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/access";
import { generateMcpToken, hashMcpToken } from "@/lib/mcp/auth";
import { isMcpEligibleRole } from "@/lib/mcp/access";
import { logActivity } from "@/lib/activity";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user.isAdmin) throw new Error("Forbidden");
  return user;
}

/**
 * Mint a per-user MCP token. Returns the PLAINTEXT token exactly once — only
 * the sha256 hash is stored, so it can never be shown again.
 */
export async function mintMcpToken(userId: string, label: string): Promise<{ token: string }> {
  const admin = await requireAdmin();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true, role: true, active: true } });
  if (!user.active) throw new Error("Cannot mint a token for a deactivated user");
  if (!isMcpEligibleRole(user.role)) throw new Error("Client-portal accounts cannot use the MCP");

  const token = generateMcpToken();
  await db.mcpToken.create({
    data: { tokenHash: hashMcpToken(token), userId, label: label.trim() || null },
  });
  await logActivity({
    source: "admin_action",
    eventType: "mcp_token_minted",
    severity: "info",
    summary: `MCP token minted for ${user.name ?? user.email} by ${admin.name ?? admin.email}.`,
  });
  revalidatePath("/admin/mcp-tokens");
  return { token };
}

export async function revokeMcpToken(tokenId: string): Promise<void> {
  const admin = await requireAdmin();
  const row = await db.mcpToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
    include: { user: { select: { email: true, name: true } } },
  });
  await logActivity({
    source: "admin_action",
    eventType: "mcp_token_revoked",
    severity: "info",
    summary: `MCP token for ${row.user.name ?? row.user.email} revoked by ${admin.name ?? admin.email}.`,
  });
  revalidatePath("/admin/mcp-tokens");
}
