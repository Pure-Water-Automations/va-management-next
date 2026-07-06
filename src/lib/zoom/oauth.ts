/**
 * Zoom OAuth (Marketplace General / User-Managed app) — the "Connect Zoom" install
 * flow. A staff admin authorizes the app on a Zoom account; we exchange the code for
 * access + refresh tokens (used to download that account's recording transcripts).
 * Mirrors src/lib/notion-oauth.ts: the same NEXTAUTH_SECRET-signed state (CSRF +
 * carries the installer's email), and a Basic-auth token exchange. Everything is
 * inert until ZOOM_CLIENT_ID/SECRET are set.
 */
import crypto from "node:crypto";
import { env } from "@/lib/env";

const ZOOM_AUTHORIZE_URL = "https://zoom.us/oauth/authorize";
const ZOOM_TOKEN_URL = "https://zoom.us/oauth/token";

export function zoomOauthConfigured(): boolean {
  return !!(env.ZOOM_CLIENT_ID?.trim() && env.ZOOM_CLIENT_SECRET?.trim());
}

export function zoomRedirectUri(): string {
  if (env.ZOOM_REDIRECT_URI?.trim()) return env.ZOOM_REDIRECT_URI.trim();
  const base = (env.APP_BASE_URL || "https://dev-team.pwasecondbrain.uk").replace(/\/+$/, "");
  return `${base}/api/zoom/oauth/callback`;
}

// ── Signed state (CSRF + carries the installing user) ────────────────────────

type StatePayload = { email: string; ret: string; nonce: string; ts: number };

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function signState(email: string, ret: string): string {
  const payload: StatePayload = { email, ret, nonce: crypto.randomBytes(8).toString("hex"), ts: Date.now() };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(crypto.createHmac("sha256", env.NEXTAUTH_SECRET).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyState(state: string): StatePayload | null {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac("sha256", env.NEXTAUTH_SECRET).update(body).digest());
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as StatePayload;
    if (Date.now() - payload.ts > 15 * 60 * 1000) return null; // 15-min window
    return payload;
  } catch {
    return null;
  }
}

// ── Authorize URL + token exchange / refresh ─────────────────────────────────

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.ZOOM_CLIENT_ID!.trim(),
    redirect_uri: zoomRedirectUri(),
    state,
  });
  return `${ZOOM_AUTHORIZE_URL}?${params.toString()}`;
}

export type ZoomTokenResult = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  scope?: string;
  token_type?: string;
};

function basicAuthHeader(): string {
  const raw = `${env.ZOOM_CLIENT_ID!.trim()}:${env.ZOOM_CLIENT_SECRET!.trim()}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

async function tokenRequest(form: URLSearchParams): Promise<ZoomTokenResult> {
  const res = await fetch(ZOOM_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Zoom token request failed (${res.status}): ${text.slice(0, 200)}`);
  const data = JSON.parse(text) as ZoomTokenResult;
  if (!data.access_token || !data.refresh_token) throw new Error("Zoom returned no tokens");
  return data;
}

/** Exchange an authorization code for tokens. */
export function exchangeCode(code: string): Promise<ZoomTokenResult> {
  return tokenRequest(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: zoomRedirectUri() }),
  );
}

/**
 * Refresh an access token. NOTE: Zoom rotates the refresh_token on every refresh —
 * the caller MUST persist the returned refresh_token or the next refresh will fail.
 */
export function refreshAccessToken(refreshToken: string): Promise<ZoomTokenResult> {
  return tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

export type ZoomMe = { id: string; email: string; account_id?: string; display_name?: string };

/** Fetch the authorized account's identity (id matches recording webhook host_id). */
export async function getMe(accessToken: string): Promise<ZoomMe> {
  const res = await fetch("https://api.zoom.us/v2/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Zoom /users/me failed (${res.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text) as ZoomMe;
}
