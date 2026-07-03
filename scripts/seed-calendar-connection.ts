/**
 * Bootstrap a CalendarConnection from an existing OAuth token file (e.g. the
 * google-workspace MCP credential, which already carries the calendar scopes).
 * Lets the configured rep's Google Calendar work immediately without a per-rep
 * OAuth connect.
 *
 *   tsx scripts/seed-calendar-connection.ts <tokenFile> <repEmail> [calendarId]
 *
 * Defaults: tokenFile=$GOOGLE_WORKSPACE_TOKEN_FILE, repEmail=$DEV_AUTH_EMAIL.
 */
import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";
import { upsertCalendarConnection } from "@/lib/calendar-connection";

const tokenFile = process.argv[2] || process.env.GOOGLE_WORKSPACE_TOKEN_FILE;
const repEmail = (process.argv[3] || process.env.DEV_AUTH_EMAIL || "okamotomiak@gmail.com").toLowerCase();
const calendarId = process.argv[4] || "primary";

async function main() {
  if (!tokenFile) {
    console.error("usage: tsx scripts/seed-calendar-connection.ts <tokenFile> <repEmail> [calendarId]");
    process.exit(1);
  }
  const t = JSON.parse(await readFile(tokenFile, "utf8")) as Record<string, unknown>;
  const clientId = t.client_id as string | undefined;
  const clientSecret = t.client_secret as string | undefined;
  const refreshToken = t.refresh_token as string | undefined;
  if (!clientId || !clientSecret || !refreshToken) {
    console.error("token file missing client_id / client_secret / refresh_token");
    process.exit(1);
  }
  const scopes = Array.isArray(t.scopes) ? (t.scopes as string[]).join(" ") : ((t.scope as string) || "");
  if (!scopes.includes("auth/calendar")) {
    console.warn("WARNING: token does not appear to carry a calendar scope:", scopes);
  }
  const expiryDate =
    typeof t.expiry_date === "number" ? t.expiry_date : typeof t.expiry === "string" ? Date.parse(t.expiry as string) : null;

  const conn = await upsertCalendarConnection({
    repEmail,
    calendarId,
    clientId,
    clientSecret,
    refreshToken,
    accessToken: (t.access_token as string) ?? (t.token as string) ?? null,
    tokenUri: (t.token_uri as string) ?? "https://oauth2.googleapis.com/token",
    expiryDate: Number.isFinite(expiryDate as number) ? (expiryDate as number) : null,
    scope: scopes || null,
    email: repEmail,
    createdByEmail: "bootstrap",
  });
  console.log(`seeded CalendarConnection: ${conn.repEmail} -> calendar "${conn.calendarId}"`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
