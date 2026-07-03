import test from "node:test";
import assert from "node:assert/strict";

import { overlapsBusy, toBusyMs, generateSlots, type BookingRep } from "../src/lib/discovery-booking";
import { buildEventBody, meetLinkOf, tokenHasCalendarScope, oauthClientFromToken } from "../src/lib/google/calendar";

test("overlapsBusy uses half-open intervals (touching is NOT overlap)", () => {
  const busy = [{ startMs: 100, endMs: 200 }];
  assert.equal(overlapsBusy(150, 180, busy), true); // inside
  assert.equal(overlapsBusy(50, 120, busy), true); // straddles start
  assert.equal(overlapsBusy(180, 260, busy), true); // straddles end
  assert.equal(overlapsBusy(200, 260, busy), false); // starts exactly when busy ends
  assert.equal(overlapsBusy(20, 100, busy), false); // ends exactly when busy starts
  assert.equal(overlapsBusy(0, 50, busy), false); // before
  assert.equal(overlapsBusy(0, 50, undefined), false); // no busy data
});

test("toBusyMs parses ISO intervals and drops junk", () => {
  const out = toBusyMs([
    { start: "2026-06-28T14:00:00Z", end: "2026-06-28T16:00:00Z" },
    { start: "nonsense", end: "2026-06-28T16:00:00Z" }, // dropped
    { start: "2026-06-28T16:00:00Z", end: "2026-06-28T15:00:00Z" }, // end<=start dropped
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].startMs, Date.parse("2026-06-28T14:00:00Z"));
});

test("generateSlots excludes slots overlapping a rep's calendar busy time", () => {
  const rep: BookingRep = { email: "a@pwa.com", windows: Array.from({ length: 7 }, (_, day) => ({ day, start: "09:00", end: "11:00" })) };
  const now = new Date("2026-06-28T00:00:00.000Z");
  const opts = { slotMinutes: 30, horizonDays: 0, tzOffsetMinutes: 0, leadMinutes: 0 };
  const free = generateSlots([rep], opts, now, []);
  assert.equal(free.length, 4); // 9:00, 9:30, 10:00, 10:30

  // Mark 09:00–10:00 busy on a@pwa's calendar.
  const busyByRep = new Map([["a@pwa.com", toBusyMs([{ start: "2026-06-28T09:00:00Z", end: "2026-06-28T10:00:00Z" }])]]);
  const withBusy = generateSlots([rep], opts, now, [], undefined, busyByRep);
  assert.deepEqual(withBusy.map((s) => s.startIso), ["2026-06-28T10:00:00.000Z", "2026-06-28T10:30:00.000Z"]);
});

test("buildEventBody includes attendees + a Meet create-request when asked", () => {
  const body = buildEventBody({
    summary: "Discovery call", description: "hi",
    startIso: "2026-06-29T14:00:00Z", endIso: "2026-06-29T14:30:00Z",
    attendees: ["lead@x.org", "", "rep@pwa.com"], meetRequestId: "req-1",
  });
  assert.equal(body.start?.dateTime, "2026-06-29T14:00:00Z");
  assert.deepEqual(body.attendees?.map((a) => a.email), ["lead@x.org", "rep@pwa.com"]); // blank dropped
  assert.equal(body.conferenceData?.createRequest?.requestId, "req-1");
  assert.equal(body.conferenceData?.createRequest?.conferenceSolutionKey?.type, "hangoutsMeet");
});

test("buildEventBody omits conferenceData when no meetRequestId", () => {
  const body = buildEventBody({ summary: "x", description: "y", startIso: "a", endIso: "b", attendees: [] });
  assert.equal(body.conferenceData, undefined);
});

test("meetLinkOf prefers hangoutLink, falls back to a video entry point", () => {
  assert.equal(meetLinkOf({ hangoutLink: "https://meet/abc" }), "https://meet/abc");
  assert.equal(meetLinkOf({ conferenceData: { entryPoints: [{ entryPointType: "phone", uri: "tel:1" }, { entryPointType: "video", uri: "https://meet/xyz" }] } }), "https://meet/xyz");
  assert.equal(meetLinkOf({}), null);
});

test("tokenHasCalendarScope detects calendar scope in either token shape", () => {
  assert.equal(tokenHasCalendarScope({ scopes: ["https://www.googleapis.com/auth/calendar.events"] }), true);
  assert.equal(tokenHasCalendarScope({ scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar" }), true);
  assert.equal(tokenHasCalendarScope({ scope: "https://www.googleapis.com/auth/gmail.send" }), false);
});

test("oauthClientFromToken returns null without a refresh token + client creds", () => {
  assert.equal(oauthClientFromToken({ access_token: "x" }), null);
  assert.ok(oauthClientFromToken({ client_id: "a", client_secret: "b", refresh_token: "c" }));
});

test("safeReturn blocks open-redirects, allows local paths", async () => {
  const { safeReturn } = await import("../src/lib/calendar-oauth");
  assert.equal(safeReturn("/sales/calendar"), "/sales/calendar");
  assert.equal(safeReturn("/hr"), "/hr");
  assert.equal(safeReturn("//evil.com"), "/sales/calendar"); // protocol-relative
  assert.equal(safeReturn("https://evil.com"), "/sales/calendar");
  assert.equal(safeReturn("evil"), "/sales/calendar");
  assert.equal(safeReturn(""), "/sales/calendar");
  assert.equal(safeReturn(null), "/sales/calendar");
});
