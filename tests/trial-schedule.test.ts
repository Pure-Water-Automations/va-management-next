import test from "node:test";
import assert from "node:assert/strict";

import {
  parseTimezoneOffset,
  candidateLocalTime,
  localToUtcTime,
  isDeclaredDay,
  blockWindow,
  isWithinDeclaredWindow,
  nextWindowOpen,
  checkinDueAt,
  shouldRemind,
  currentTrialDay,
  calculateTimerCapDelta,
  SIX_HOURS_SEC,
} from "../src/lib/trial/schedule";

test("parseTimezoneOffset handles standard and complex strings", () => {
  assert.equal(parseTimezoneOffset("GMT+8 — Manila"), 480);
  assert.equal(parseTimezoneOffset("GMT+8"), 480);
  assert.equal(parseTimezoneOffset("UTC+05:30"), 330);
  assert.equal(parseTimezoneOffset("GMT-5 — New York"), -300);
  assert.equal(parseTimezoneOffset("GMT-08:00"), -480);
  assert.equal(parseTimezoneOffset("GMT"), 0);
  assert.equal(parseTimezoneOffset("UTC"), 0);
  assert.equal(parseTimezoneOffset(""), 0);
  assert.equal(parseTimezoneOffset(null), 0);
});

test("blockWindow returns correct startHour and endHour for blocks", () => {
  assert.deepEqual(blockWindow("Morning"), {
    block: "Morning",
    startHour: 6,
    endHour: 12,
    label: "06:00-12:00",
  });
  assert.deepEqual(blockWindow("afternoon"), {
    block: "Afternoon",
    startHour: 12,
    endHour: 18,
    label: "12:00-18:00",
  });
  assert.deepEqual(blockWindow("EVENING"), {
    block: "Evening",
    startHour: 18,
    endHour: 24,
    label: "18:00-24:00",
  });
});

test("candidateLocalTime correctly shifts UTC Date to match local wall-clock methods", () => {
  // 2026-07-13T00:00:00Z (Monday midnight UTC)
  const utc = new Date("2026-07-13T00:00:00Z");
  const local = candidateLocalTime(utc, "GMT+8 — Manila");
  // In GMT+8, 00:00 UTC is 08:00 AM local time Monday
  assert.equal(local.getUTCHours(), 8);
  assert.equal(local.getUTCDay(), 1); // Monday
  assert.equal(local.getUTCDate(), 13);
});

test("isDeclaredDay checks candidate local date across date boundaries", () => {
  // 2026-07-11T16:00:00Z is Saturday 4 PM UTC.
  // In GMT+8 (+8h), local time is 2026-07-12T00:00:00 (Sunday midnight).
  const utcDate = new Date("2026-07-11T16:00:00Z");
  assert.equal(isDeclaredDay(utcDate, "GMT+8", ["Sat", "Sun"]), true);
  assert.equal(isDeclaredDay(utcDate, "GMT+8", ["Sat"]), false); // Because locally it's Sunday
  assert.equal(isDeclaredDay(utcDate, "GMT+8", "Sun,Mon"), true);
});

test("isWithinDeclaredWindow evaluates candidate local time inside and across midnight", () => {
  // Evening block: 18:00 - 24:00 candidate-local.
  // Suppose candidate in GMT+8. 14:00 UTC = 22:00 local Manila time (Monday 2026-07-13).
  const insideDate = new Date("2026-07-13T14:00:00Z");
  assert.equal(isWithinDeclaredWindow(insideDate, "GMT+8", ["Mon"], "Evening"), true);

  // 16:00 UTC = 24:00 (00:00 Tuesday) local Manila time. Evening block ended at 24:00.
  const afterMidnightDate = new Date("2026-07-13T16:00:00Z");
  assert.equal(isWithinDeclaredWindow(afterMidnightDate, "GMT+8", ["Mon"], "Evening"), false);
});

test("nextWindowOpen finds today or future window start time accurately", () => {
  // Candidate in GMT+8, Morning block (06:00-12:00). Declared: Mon, Tue.
  // Suppose now is Monday 04:00 AM local (2026-07-12T20:00:00Z).
  const monEarlyUTC = new Date("2026-07-12T20:00:00Z");
  const monOpen = nextWindowOpen(monEarlyUTC, "GMT+8", ["Mon", "Tue"], "Morning");
  // Monday 06:00 AM local = 2026-07-12T22:00:00Z
  assert.equal(monOpen.toISOString(), "2026-07-12T22:00:00.000Z");

  // Suppose now is Monday 07:00 AM local (2026-07-12T23:00:00Z).
  // Today's window already opened, so next open is Tuesday 06:00 AM local = 2026-07-13T22:00:00Z.
  const monDuringUTC = new Date("2026-07-12T23:00:00Z");
  const tueOpen = nextWindowOpen(monDuringUTC, "GMT+8", ["Mon", "Tue"], "Morning");
  assert.equal(tueOpen.toISOString(), "2026-07-13T22:00:00.000Z");
});

test("checkinDueAt returns exactly the last hour of declared block on declared workdays", () => {
  // Morning block: 06:00-12:00 -> last hour is 11:00 AM local time.
  // Candidate in GMT+8, Mon in declaredDays.
  // Monday 08:00 AM local = 2026-07-13T00:00:00Z.
  const monMorningUTC = new Date("2026-07-13T00:00:00Z");
  const due = checkinDueAt(monMorningUTC, "GMT+8", ["Mon"], "Morning");
  assert.ok(due);
  // 11:00 AM Manila on 2026-07-13 is 03:00:00 UTC on 2026-07-13.
  assert.equal(due!.toISOString(), "2026-07-13T03:00:00.000Z");

  // If Sunday is not a declared day, checkinDueAt returns null.
  const sunMorningUTC = new Date("2026-07-12T00:00:00Z"); // Sunday 08:00 AM Manila
  assert.equal(checkinDueAt(sunMorningUTC, "GMT+8", ["Mon"], "Morning"), null);
});

test("shouldRemind obeys escalating gaps and NEVER reminds outside declared window", () => {
  const tz = "GMT+8";
  const declaredDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const block = "Morning"; // 06:00 - 12:00 local time

  // Checkin requested at Monday 11:00 AM Manila = 2026-07-13T03:00:00Z
  const reqAt = new Date("2026-07-13T03:00:00Z");

  // Inside window Monday 11:30 AM Manila (30 mins later -> under 2h gap)
  const now30m = new Date("2026-07-13T03:30:00Z");
  assert.equal(shouldRemind(reqAt, 0, now30m, tz, declaredDays, block), false);

  // Outside window Monday 14:00 Manila (3 hours later -> >= 2h, BUT outside window!)
  const nowOutside = new Date("2026-07-13T06:00:00Z");
  assert.equal(shouldRemind(reqAt, 0, nowOutside, tz, declaredDays, block), false);

  // Next morning Tuesday 06:00 AM Manila (19 hours after reqAt -> inside window, gap >= 2h)
  const nowTueMorning = new Date("2026-07-13T22:00:00Z");
  assert.equal(shouldRemind(reqAt, 0, nowTueMorning, tz, declaredDays, block), true);

  // Second reminder (remindersSentCount === 1):
  // If first reminder was sent at Tuesday 06:15 AM Manila (= 2026-07-13T22:15:00Z),
  // second reminder should wait until next window open (Wednesday 06:00 AM Manila = 2026-07-14T22:00:00Z).
  const firstRemSentAt = new Date("2026-07-13T22:15:00Z");
  const nowTueLater = new Date("2026-07-13T23:00:00Z"); // Tuesday 07:00 AM (still Tuesday window)
  assert.equal(shouldRemind(reqAt, 1, nowTueLater, tz, declaredDays, block, firstRemSentAt), false);

  const nowWedMorning = new Date("2026-07-14T22:00:00Z"); // Wednesday 06:00 AM Manila
  assert.equal(shouldRemind(reqAt, 1, nowWedMorning, tz, declaredDays, block, firstRemSentAt), true);

  // If remindersSentCount >= 2, no more reminders
  assert.equal(shouldRemind(reqAt, 2, nowWedMorning, tz, declaredDays, block, firstRemSentAt), false);
});

test("currentTrialDay calculates 1-based day relative to startDate local midnight", () => {
  const tz = "GMT+8";
  // Start on Monday July 13 08:00 AM local = 2026-07-13T00:00:00Z
  const startDate = new Date("2026-07-13T00:00:00Z");

  // Same day 15:00 local
  const sameDay = new Date("2026-07-13T07:00:00Z");
  assert.equal(currentTrialDay(startDate, sameDay, tz), 1);

  // Next day 09:00 local = Tuesday July 14
  const nextDay = new Date("2026-07-14T01:00:00Z");
  assert.equal(currentTrialDay(startDate, nextDay, tz), 2);
});

test("calculateTimerCapDelta caps active timer delta at exactly 6 hours", () => {
  const now = new Date("2026-07-11T16:00:00Z");
  // Started 4 hours ago
  const started4h = new Date("2026-07-11T12:00:00Z");
  assert.deepEqual(calculateTimerCapDelta(started4h, now), {
    timedOut: false,
    deltaSeconds: 4 * 3600,
  });

  // Started 8 hours ago
  const started8h = new Date("2026-07-11T08:00:00Z");
  assert.deepEqual(calculateTimerCapDelta(started8h, now), {
    timedOut: true,
    deltaSeconds: SIX_HOURS_SEC, // 6 * 3600
  });
});
