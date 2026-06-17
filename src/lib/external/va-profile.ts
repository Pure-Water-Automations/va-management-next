import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import type { Va } from "@prisma/client";

/**
 * Verify a server-to-server caller of the /api/external/* bridge.
 *
 * Expects an `Authorization: Bearer <token>` header whose token matches
 * EXTERNAL_APP_SECRET. Returns false (deny) when the secret is unset, or the
 * header is missing/malformed/wrong. Comparison is constant-time.
 */
export function verifyExternalSecret(authHeader: string | null): boolean {
  const secret = env.EXTERNAL_APP_SECRET;
  if (!secret) return false;
  if (!authHeader) return false;

  const match = /^Bearer (.+)$/.exec(authHeader.trim());
  if (!match) return false;
  const token = match[1];

  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  // timingSafeEqual requires equal-length buffers; bail early (still constant
  // relative to the secret) when lengths differ.
  if (tokenBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(tokenBuf, secretBuf);
}

/**
 * Curated, read-only VA identity returned to trusted external apps.
 * Deliberately excludes compensation rates, payroll, evaluations, and any
 * audit data — only identity + light context needed to render an avatar.
 */
export type ExternalVaProfile = {
  vaId: string;
  name: string;
  email: string;
  tier: Va["compensationRole"];
  status: Va["status"];
  supervisorVaId: string | null;
  skillSpecs: string | null;
  availabilityNotes: string | null;
  notionProfileUrl: string | null;
  roleStartedDate: string | null;
};

export function toExternalVaProfile(va: Va): ExternalVaProfile {
  return {
    vaId: va.vaId,
    name: va.name,
    email: va.email,
    tier: va.compensationRole,
    status: va.status,
    supervisorVaId: va.supervisorVaId,
    skillSpecs: va.skillSpecs,
    availabilityNotes: va.availabilityNotes,
    notionProfileUrl: va.notionProfileUrl,
    roleStartedDate: va.roleStartedDate ? va.roleStartedDate.toISOString() : null,
  };
}

/** Lightweight roster entry for a world directory — identity only. */
export type ExternalRosterEntry = {
  vaId: string;
  name: string;
  tier: Va["compensationRole"];
  status: Va["status"];
};

export function toExternalRosterEntry(va: Va): ExternalRosterEntry {
  return { vaId: va.vaId, name: va.name, tier: va.compensationRole, status: va.status };
}
