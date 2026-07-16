import test from "node:test";
import assert from "node:assert/strict";

import { isAvailableNow, estHourNow, hourLabel } from "../src/lib/services/availability";

test("isAvailableNow: within a same-day window", () => {
  assert.equal(isAvailableNow(6, 12, 7), true);
  assert.equal(isAvailableNow(6, 12, 6), true);
  assert.equal(isAvailableNow(6, 12, 5.9), false);
  assert.equal(isAvailableNow(6, 12, 12), false); // end is exclusive
});

test("isAvailableNow: overnight window wraps past midnight", () => {
  assert.equal(isAvailableNow(22, 6, 23), true);
  assert.equal(isAvailableNow(22, 6, 2), true);
  assert.equal(isAvailableNow(22, 6, 10), false);
});

test("isAvailableNow: zero-width window is never available", () => {
  assert.equal(isAvailableNow(6, 6, 6), false);
});

test("isAvailableNow: missing start or end means no window set", () => {
  assert.equal(isAvailableNow(null, 12, 10), false);
  assert.equal(isAvailableNow(6, null, 10), false);
  assert.equal(isAvailableNow(undefined, undefined, 10), false);
});

test("hourLabel formats midnight and noon half-hours as 12, not 0", () => {
  assert.equal(hourLabel(0.5), "12:30 AM");
  assert.equal(hourLabel(12.5), "12:30 PM");
  assert.equal(hourLabel(0), "12:00 AM");
  assert.equal(hourLabel(12), "12:00 PM");
});

test("hourLabel formats regular hours", () => {
  assert.equal(hourLabel(6), "6:00 AM");
  assert.equal(hourLabel(13.5), "1:30 PM");
  assert.equal(hourLabel(23.5), "11:30 PM");
});

test("estHourNow converts a UTC instant to a decimal EST/EDT hour-of-day", () => {
  // 2026-07-16T14:30:00Z is EDT (UTC-4) -> 10:30 local -> 10.5
  assert.equal(estHourNow(new Date("2026-07-16T14:30:00.000Z")), 10.5);
  // 2026-01-16T14:30:00Z is EST (UTC-5) -> 09:30 local -> 9.5
  assert.equal(estHourNow(new Date("2026-01-16T14:30:00.000Z")), 9.5);
});
