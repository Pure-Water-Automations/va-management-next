/**
 * ZoomConnection persistence + token access. Tokens live in the DB like
 * CalendarConnection/NotionConnection (never returned to the browser). The
 * recording worker resolves a meeting's host_id → a fresh access token here.
 */
import { db } from "@/lib/db";
import { refreshAccessToken } from "@/lib/zoom/oauth";

export type UpsertZoomConnectionInput = {
  zoomUserId: string;
  email: string;
  userId?: string | null;
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  scopes?: string | null;
};

/** Upsert an installed Zoom account's tokens (from the OAuth callback). */
export function upsertZoomConnection(input: UpsertZoomConnectionInput) {
  const tokenExpiry = new Date(Date.now() + input.expiresInSec * 1000);
  const data = {
    email: input.email,
    userId: input.userId ?? null,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    tokenExpiry,
    scopes: input.scopes ?? null,
    active: true,
  };
  return db.zoomConnection.upsert({
    where: { zoomUserId: input.zoomUserId },
    update: data,
    create: { zoomUserId: input.zoomUserId, ...data },
  });
}

/**
 * A usable access token for a meeting host, refreshing (and persisting Zoom's
 * rotated refresh token) when near expiry. Returns null if the account isn't
 * connected — the caller then falls back to the webhook's short-lived
 * download_token, or skips the capture.
 */
export async function accessTokenForHost(hostZoomId: string): Promise<string | null> {
  const conn = await db.zoomConnection.findUnique({ where: { zoomUserId: hostZoomId } });
  if (!conn || !conn.active) return null;

  const skewMs = 60_000; // refresh a minute before expiry
  if (conn.tokenExpiry.getTime() - skewMs > Date.now()) return conn.accessToken;

  const tok = await refreshAccessToken(conn.refreshToken);
  await db.zoomConnection.update({
    where: { zoomUserId: hostZoomId },
    data: {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token, // Zoom rotates the refresh token on every use
      tokenExpiry: new Date(Date.now() + tok.expires_in * 1000),
      scopes: tok.scope ?? conn.scopes,
    },
  });
  return tok.access_token;
}
