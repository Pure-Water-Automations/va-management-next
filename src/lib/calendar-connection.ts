/**
 * Per-rep Google Calendar credential plumbing. Resolves a rep's stored
 * CalendarConnection into an auto-refreshing OAuth2 client + calendarId; provides
 * the connect-time persistence + a status read for the admin UI. Tokens live in
 * the DB (like NotionConnection), never on the public path.
 */
import type { OAuth2Client } from "google-auth-library";
import { db } from "@/lib/db";
import { oauthClientFromToken } from "@/lib/google/calendar";

export type RepCalendar = { auth: OAuth2Client; calendarId: string };

/** Build the OAuth client + calendarId for a rep, or null if not connected/usable. */
export async function resolveRepCalendar(repEmail: string | null | undefined): Promise<RepCalendar | null> {
  if (!repEmail) return null;
  const conn = await db.calendarConnection.findUnique({ where: { repEmail: repEmail.toLowerCase() } });
  if (!conn || !conn.active) return null;
  const auth = oauthClientFromToken({
    client_id: conn.clientId,
    client_secret: conn.clientSecret,
    refresh_token: conn.refreshToken,
    access_token: conn.accessToken ?? undefined,
    expiry_date: conn.expiryDate != null ? Number(conn.expiryDate) : undefined,
    token_uri: conn.tokenUri ?? undefined,
    scope: conn.scope ?? undefined,
  });
  if (!auth) return null;
  return { auth, calendarId: conn.calendarId };
}

/** Which of the given rep emails have an active calendar connection. */
export async function connectedReps(repEmails: string[]): Promise<Set<string>> {
  const lowered = repEmails.map((e) => e.toLowerCase());
  if (!lowered.length) return new Set();
  const rows = await db.calendarConnection.findMany({
    where: { repEmail: { in: lowered }, active: true },
    select: { repEmail: true },
  });
  return new Set(rows.map((r) => r.repEmail));
}

export type CalendarTokenInput = {
  repEmail: string;
  calendarId?: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string | null;
  tokenUri?: string | null;
  expiryDate?: number | null;
  scope?: string | null;
  email?: string | null;
  createdByEmail?: string | null;
};

/** Upsert a rep's calendar credential (from the OAuth callback or a bootstrap seed). */
export async function upsertCalendarConnection(input: CalendarTokenInput) {
  const repEmail = input.repEmail.toLowerCase();
  const data = {
    calendarId: input.calendarId || "primary",
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    refreshToken: input.refreshToken,
    accessToken: input.accessToken ?? null,
    tokenUri: input.tokenUri ?? null,
    expiryDate: input.expiryDate != null ? BigInt(input.expiryDate) : null,
    scope: input.scope ?? null,
    email: input.email ?? null,
    active: true,
    createdByEmail: input.createdByEmail ?? null,
  };
  return db.calendarConnection.upsert({ where: { repEmail }, update: data, create: { repEmail, ...data } });
}

/** Status for the admin connect UI. */
export async function calendarConnections() {
  return db.calendarConnection.findMany({
    where: { active: true },
    select: { repEmail: true, calendarId: true, email: true, updatedAt: true },
    orderBy: { repEmail: "asc" },
  });
}
