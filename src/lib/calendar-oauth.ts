/**
 * Per-rep Google Calendar connect flow — "Connect Google Calendar" for a sales
 * rep. Reuses the existing Google OAuth client (GOOGLE_OAUTH_CLIENT_ID/SECRET) and
 * the signed-state CSRF pattern from notion-oauth. When the OAuth client isn't
 * configured the connect UI hides and the system uses the bootstrap (workspace)
 * connection + .ics fallback instead.
 */
import crypto from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { env } from "@/lib/env";

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function calendarOauthConfigured(): boolean {
  return !!(env.GOOGLE_OAUTH_CLIENT_ID?.trim() && env.GOOGLE_OAUTH_CLIENT_SECRET?.trim());
}

export function calendarRedirectUri(): string {
  const base = (env.APP_BASE_URL || "https://team.pwasecondbrain.uk").replace(/\/+$/, "");
  return `${base}/api/calendar/oauth/callback`;
}

export function calendarOauthClient(): OAuth2Client | null {
  if (!calendarOauthConfigured()) return null;
  return new OAuth2Client(env.GOOGLE_OAUTH_CLIENT_ID!.trim(), env.GOOGLE_OAUTH_CLIENT_SECRET!.trim(), calendarRedirectUri());
}

// ── Signed state (CSRF + carries the rep being connected) ────────────────────

type CalStatePayload = { repEmail: string; ret: string; nonce: string; ts: number };

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function signCalState(repEmail: string, ret: string): string {
  const payload: CalStatePayload = { repEmail: repEmail.toLowerCase(), ret, nonce: crypto.randomBytes(8).toString("hex"), ts: Date.now() };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(crypto.createHmac("sha256", env.NEXTAUTH_SECRET).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyCalState(state: string): CalStatePayload | null {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac("sha256", env.NEXTAUTH_SECRET).update(body).digest());
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as CalStatePayload;
    if (Date.now() - payload.ts > 15 * 60 * 1000) return null; // 15-min window
    return payload;
  } catch {
    return null;
  }
}

export function authorizeCalendarUrl(state: string): string | null {
  const client = calendarOauthClient();
  if (!client) return null;
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force a refresh_token even on re-auth
    include_granted_scopes: true,
    scope: CALENDAR_SCOPES,
    state,
  });
}
