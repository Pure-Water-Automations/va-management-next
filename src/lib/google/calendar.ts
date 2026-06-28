/**
 * Thin Google Calendar wrapper for discovery-call booking: free/busy lookups and
 * event lifecycle (create with a Google Meet link, reschedule, cancel). Builds an
 * auto-refreshing OAuth2 client from a saved token JSON — the same token shape the
 * email sender uses, and also the broad google-workspace MCP credential (which
 * already carries the calendar + calendar.events scopes).
 */
import { calendar as calendarApi, type calendar_v3 } from "@googleapis/calendar";
import { OAuth2Client } from "google-auth-library";

/** A saved OAuth token. Tolerates both shapes: the email-sender token
 *  ({access_token, expiry_date, scope}) and the workspace-MCP token ({token, expiry, scopes}). */
export type CalendarTokenJson = {
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  access_token?: string;
  token?: string;
  expiry_date?: number;
  expiry?: string;
  token_uri?: string;
  scope?: string;
  scopes?: string[];
};

/** Does the token grant enough to read busy times / write events? */
export function tokenHasCalendarScope(t: CalendarTokenJson): boolean {
  const scopes = t.scopes ?? (typeof t.scope === "string" ? t.scope.split(/\s+/) : []);
  return scopes.some((s) => s.includes("auth/calendar"));
}

/** Build an auto-refreshing OAuth2 client from a saved token JSON, or null if unusable. */
export function oauthClientFromToken(t: CalendarTokenJson): OAuth2Client | null {
  if (!t.refresh_token || !t.client_id || !t.client_secret) return null;
  const client = new OAuth2Client(t.client_id, t.client_secret);
  client.setCredentials({
    refresh_token: t.refresh_token,
    access_token: t.access_token ?? t.token,
    expiry_date: t.expiry_date ?? (t.expiry ? Date.parse(t.expiry) : undefined),
    scope: t.scope ?? t.scopes?.join(" "),
  });
  return client;
}

function client(auth: OAuth2Client) {
  return calendarApi({ version: "v3", auth });
}

export type BusyInterval = { start: string; end: string };

/** Busy intervals on `calendarId` between the two ISO instants. */
export async function freeBusy(auth: OAuth2Client, calendarId: string, timeMinIso: string, timeMaxIso: string): Promise<BusyInterval[]> {
  const res = await client(auth).freebusy.query({
    requestBody: { timeMin: timeMinIso, timeMax: timeMaxIso, items: [{ id: calendarId }] },
  });
  const cals = res.data.calendars ?? {};
  const cal = cals[calendarId] ?? Object.values(cals)[0];
  return (cal?.busy ?? [])
    .filter((b): b is { start: string; end: string } => !!b.start && !!b.end)
    .map((b) => ({ start: b.start, end: b.end }));
}

export type CreatedEvent = { eventId: string; htmlLink: string | null; meetLink: string | null };

/** Pure builder for the event body — kept separate so it's unit-testable. */
export function buildEventBody(input: {
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
  attendees: string[];
  meetRequestId?: string;
}): calendar_v3.Schema$Event {
  const body: calendar_v3.Schema$Event = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startIso },
    end: { dateTime: input.endIso },
    attendees: input.attendees.filter(Boolean).map((email) => ({ email })),
  };
  if (input.meetRequestId) {
    body.conferenceData = {
      createRequest: { requestId: input.meetRequestId, conferenceSolutionKey: { type: "hangoutsMeet" } },
    };
  }
  return body;
}

/** Extract the Google Meet video link from a created/updated event. */
export function meetLinkOf(ev: calendar_v3.Schema$Event): string | null {
  if (ev.hangoutLink) return ev.hangoutLink;
  const ep = ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video");
  return ep?.uri ?? null;
}

/** Create a calendar event (with a Meet link) and invite the attendees. */
export async function createEvent(
  auth: OAuth2Client,
  calendarId: string,
  input: { summary: string; description: string; startIso: string; endIso: string; attendees: string[]; meetRequestId: string },
): Promise<CreatedEvent> {
  const res = await client(auth).events.insert({
    calendarId,
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: buildEventBody(input),
  });
  return { eventId: res.data.id ?? "", htmlLink: res.data.htmlLink ?? null, meetLink: meetLinkOf(res.data) };
}

/** Move an existing event to a new time (keeps the Meet link + invite). */
export async function updateEventTime(
  auth: OAuth2Client,
  calendarId: string,
  eventId: string,
  startIso: string,
  endIso: string,
): Promise<void> {
  await client(auth).events.patch({
    calendarId,
    eventId,
    sendUpdates: "all",
    requestBody: { start: { dateTime: startIso }, end: { dateTime: endIso } },
  });
}

/** Cancel an event. 404/410 (already gone) is treated as success. */
export async function deleteEvent(auth: OAuth2Client, calendarId: string, eventId: string): Promise<void> {
  try {
    await client(auth).events.delete({ calendarId, eventId, sendUpdates: "all" });
  } catch (err) {
    const code = (err as { code?: number; status?: number }).code ?? (err as { status?: number }).status;
    if (code === 404 || code === 410) return; // already cancelled/removed
    throw err;
  }
}
