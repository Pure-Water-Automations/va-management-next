import test from "node:test";
import assert from "node:assert/strict";

import {
  parseBookingConfig,
  generateSlots,
  isSlotOpen,
  buildIcs,
  type BookingRep,
} from "../src/lib/discovery-booking";

// A rep available 09:00–11:00 every day, so tests don't depend on the weekday.
const allDayWindows = Array.from({ length: 7 }, (_, day) => ({ day, start: "09:00", end: "11:00" }));
const repA: BookingRep = { email: "a@pwa.com", name: "Rep A", windows: allDayWindows, videoUrl: "https://meet/a" };
const now = new Date("2026-06-28T00:00:00.000Z"); // midnight UTC

test("parseBookingConfig drops junk and bad windows", () => {
  const cfg = parseBookingConfig(JSON.stringify([
    { email: "X@PWA.com", windows: [{ day: 2, start: "09:00", end: "12:00" }, { day: 9, start: "x", end: "y" }, { day: 3, start: "12:00", end: "09:00" }] },
    { windows: [] }, // no email -> dropped
  ]));
  assert.equal(cfg.length, 1);
  assert.equal(cfg[0].email, "x@pwa.com"); // lowercased
  assert.equal(cfg[0].windows.length, 1); // bad weekday + inverted range dropped
});

test("parseBookingConfig returns [] for empty/invalid", () => {
  assert.deepEqual(parseBookingConfig(""), []);
  assert.deepEqual(parseBookingConfig("not json"), []);
  assert.deepEqual(parseBookingConfig("{}"), []);
});

test("generateSlots: 09:00–11:00 at 30min, tz=UTC, no lead time -> 4 slots today", () => {
  const slots = generateSlots([repA], { slotMinutes: 30, horizonDays: 0, tzOffsetMinutes: 0, leadMinutes: 0 }, now, []);
  assert.equal(slots.length, 4);
  assert.equal(slots[0].startIso, "2026-06-28T09:00:00.000Z");
  assert.equal(slots[0].endIso, "2026-06-28T09:30:00.000Z");
  assert.equal(slots[3].startIso, "2026-06-28T10:30:00.000Z");
  assert.equal(slots[0].repEmail, "a@pwa.com");
});

test("generateSlots removes already-booked slots for that rep", () => {
  const slots = generateSlots([repA], { slotMinutes: 30, horizonDays: 0, tzOffsetMinutes: 0, leadMinutes: 0 }, now, [
    { repEmail: "a@pwa.com", startIso: "2026-06-28T09:00:00.000Z" },
  ]);
  assert.equal(slots.length, 3);
  assert.ok(!slots.some((s) => s.startIso === "2026-06-28T09:00:00.000Z"));
});

test("generateSlots honors lead time (min notice)", () => {
  // 600 min lead from midnight => earliest bookable is 10:00 => 10:00, 10:30
  const slots = generateSlots([repA], { slotMinutes: 30, horizonDays: 0, tzOffsetMinutes: 0, leadMinutes: 600 }, now, []);
  assert.deepEqual(slots.map((s) => s.startIso), ["2026-06-28T10:00:00.000Z", "2026-06-28T10:30:00.000Z"]);
});

test("generateSlots applies the tz offset (US Eastern = -300 => 09:00 local is 14:00Z)", () => {
  const slots = generateSlots([repA], { slotMinutes: 60, horizonDays: 0, tzOffsetMinutes: -300, leadMinutes: 0 }, now, []);
  assert.equal(slots[0].startIso, "2026-06-28T14:00:00.000Z");
});

test("generateSlots dedupes the same instant across reps (one slot, first rep wins)", () => {
  const repB: BookingRep = { email: "b@pwa.com", windows: allDayWindows };
  const slots = generateSlots([repA, repB], { slotMinutes: 30, horizonDays: 0, tzOffsetMinutes: 0, leadMinutes: 0 }, now, []);
  const at9 = slots.filter((s) => s.startIso === "2026-06-28T09:00:00.000Z");
  assert.equal(at9.length, 1);
  assert.equal(at9[0].repEmail, "a@pwa.com");
});

test("isSlotOpen confirms a real slot and rejects a fake one", () => {
  const opts = { slotMinutes: 30, horizonDays: 0, tzOffsetMinutes: 0, leadMinutes: 0 };
  assert.ok(isSlotOpen([repA], opts, now, [], "2026-06-28T09:30:00.000Z"));
  assert.equal(isSlotOpen([repA], opts, now, [], "2026-06-28T03:00:00.000Z"), null);
  // a booked slot is no longer open
  assert.equal(isSlotOpen([repA], opts, now, [{ repEmail: "a@pwa.com", startIso: "2026-06-28T09:00:00.000Z" }], "2026-06-28T09:00:00.000Z"), null);
});

test("buildIcs produces a VEVENT with the times, summary and location", () => {
  const ics = buildIcs({
    uid: "deal-1@pwa",
    startIso: "2026-06-28T14:00:00.000Z",
    endIso: "2026-06-28T14:30:00.000Z",
    summary: "Discovery call: Riverside",
    description: "A friendly chat.",
    organizerEmail: "rep@pwa.com",
    attendeeEmail: "lead@church.org",
    location: "https://meet/a",
    dtstampIso: "2026-06-27T00:00:00.000Z",
  });
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /DTSTART:20260628T140000Z/);
  assert.match(ics, /DTEND:20260628T143000Z/);
  assert.match(ics, /SUMMARY:Discovery call: Riverside/);
  assert.match(ics, /LOCATION:https:\/\/meet\/a/);
  assert.match(ics, /UID:deal-1@pwa/);
});
