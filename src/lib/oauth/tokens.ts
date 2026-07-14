import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { canUserDelegateTasks, canUserDelegateProjects } from "@/lib/auth/delegation";
import { hashMcpToken, isMcpEligibleRole, type DelegationActor } from "@/lib/mcp/token-auth";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 min, single-use
const ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const rand = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

/** The origin the client actually reached us on — the OAuth issuer must match it. */
export function requestOrigin(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}

export async function issueAuthCode(input: {
  clientId: string; userId: string; redirectUri: string; codeChallenge: string;
}): Promise<string> {
  const raw = rand("vamac_");
  await db.oAuthCode.create({
    data: { ...input, codeHash: hashMcpToken(raw), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  return raw;
}

export async function exchangeCode(input: {
  code: string; clientId: string; redirectUri: string; codeVerifier: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | { error: string }> {
  const { verifyPkce } = await import("@/lib/oauth/pkce");
  const row = await db.oAuthCode.findUnique({ where: { codeHash: hashMcpToken(input.code) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return { error: "invalid_grant" };
  if (row.clientId !== input.clientId || row.redirectUri !== input.redirectUri) return { error: "invalid_grant" };
  if (!verifyPkce(input.codeVerifier, row.codeChallenge)) return { error: "invalid_grant" };
  await db.oAuthCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return mintTokens(row.clientId, row.userId);
}

export async function refreshTokens(refreshToken: string, clientId: string) {
  const row = await db.oAuthToken.findFirst({ where: { refreshHash: hashMcpToken(refreshToken), clientId, revokedAt: null } });
  if (!row) return { error: "invalid_grant" as const };
  // Atomic claim: the `revokedAt: null` guard means only one of two concurrent
  // refreshes can ever match this row, so only one proceeds to mint new tokens.
  const claimed = await db.oAuthToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (claimed.count === 0) return { error: "invalid_grant" as const };
  return mintTokens(row.clientId, row.userId);
}

async function mintTokens(clientId: string, userId: string) {
  const accessToken = rand("vamat_");
  const refreshToken = rand("vamrt_");
  await db.oAuthToken.create({
    data: {
      clientId, userId,
      tokenHash: hashMcpToken(accessToken), refreshHash: hashMcpToken(refreshToken),
      expiresAt: new Date(Date.now() + ACCESS_TTL_MS),
    },
  });
  return { accessToken, refreshToken, expiresIn: Math.floor(ACCESS_TTL_MS / 1000) };
}

/**
 * vamat_ access token → delegation actor, or null. Mirrors the McpToken path in
 * token-auth: the user's active flag, eligibility, and delegation authority are
 * re-checked every call, so revoking access or removing delegation kills it live.
 */
export async function resolveOAuthActor(token: string): Promise<DelegationActor | null> {
  const row = await db.oAuthToken.findFirst({
    where: { tokenHash: hashMcpToken(token), revokedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!row) return null;
  const user = await db.user.findUnique({
    where: { id: row.userId },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  if (!user || !user.active || !isMcpEligibleRole(user.role)) return null;
  void db.oAuthToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  const [canDelegateTasks, canDelegateProjects] = await Promise.all([
    canUserDelegateTasks(user.id, user.role),
    canUserDelegateProjects(user.id, user.role),
  ]);
  return {
    actorId: user.id,
    actorEmail: user.email,
    actorName: user.name,
    actorRole: user.role,
    canDelegateTasks,
    canDelegateProjects,
  };
}
