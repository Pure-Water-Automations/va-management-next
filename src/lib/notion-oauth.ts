/**
 * Notion OAuth (public integration) — the one-click "Connect with Notion" flow.
 * The user picks their workspace + grants page access in Notion's own consent
 * screen; we exchange the code for an access token (used exactly like an internal
 * integration token by the sync engine). Falls back to manual token entry when
 * the OAuth app isn't configured.
 */
import crypto from "node:crypto";
import { env } from "@/lib/env";

export function notionOauthConfigured(): boolean {
  return !!(env.NOTION_OAUTH_CLIENT_ID?.trim() && env.NOTION_OAUTH_CLIENT_SECRET?.trim());
}

export function notionRedirectUri(): string {
  if (env.NOTION_OAUTH_REDIRECT_URI?.trim()) return env.NOTION_OAUTH_REDIRECT_URI.trim();
  const base = (env.APP_BASE_URL || "https://dev-team.pwasecondbrain.uk").replace(/\/+$/, "");
  return `${base}/api/notion/oauth/callback`;
}

// ── Signed state (CSRF + carries the org being connected) ────────────────────

type StatePayload = { orgId: string; ret: string; nonce: string; ts: number };

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function signState(orgId: string, ret: string): string {
  const payload: StatePayload = { orgId, ret, nonce: crypto.randomBytes(8).toString("hex"), ts: Date.now() };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(crypto.createHmac("sha256", env.NEXTAUTH_SECRET).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyState(state: string): StatePayload | null {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac("sha256", env.NEXTAUTH_SECRET).update(body).digest());
  // constant-time compare
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as StatePayload;
    if (Date.now() - payload.ts > 15 * 60 * 1000) return null; // 15-min window
    return payload;
  } catch {
    return null;
  }
}

// ── Authorize URL + token exchange ───────────────────────────────────────────

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.NOTION_OAUTH_CLIENT_ID!.trim(),
    response_type: "code",
    owner: "user",
    redirect_uri: notionRedirectUri(),
    state,
  });
  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
}

export type NotionTokenResult = {
  access_token: string;
  workspace_name?: string;
  workspace_id?: string;
  bot_id?: string;
};

/** Exchange an authorization code for an access token (Basic-auth client creds). */
export async function exchangeCode(code: string): Promise<NotionTokenResult> {
  const basic = Buffer.from(`${env.NOTION_OAUTH_CLIENT_ID!.trim()}:${env.NOTION_OAUTH_CLIENT_SECRET!.trim()}`).toString("base64");
  const res = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: notionRedirectUri() }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Notion token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  const data = JSON.parse(text) as NotionTokenResult;
  if (!data.access_token) throw new Error("Notion returned no access token");
  return data;
}
